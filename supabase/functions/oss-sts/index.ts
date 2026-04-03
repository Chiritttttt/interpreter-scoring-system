import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

serve(async (req) => {
  // 处理 OPTIONS 预检请求（关键！）
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
      status: 204  // 204 No Content 是最合适的
    });
  }

  try {
    // 验证用户身份
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "未授权" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 验证 JWT（确保是有效用户）
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "无效的认证信息" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessKeyId = Deno.env.get("OSS_ACCESS_KEY_ID");
    const accessKeySecret = Deno.env.get("OSS_ACCESS_KEY_SECRET");
    const bucket = Deno.env.get("OSS_BUCKET");
    const region = Deno.env.get("OSS_REGION");
    const endpoint = Deno.env.get("OSS_ENDPOINT") ?? `https://${bucket}.${region}.aliyuncs.com`;
    const roleArn = Deno.env.get("OSS_ROLE_ARN");

    if (!accessKeyId || !accessKeySecret || !bucket || !region) {
      return new Response(JSON.stringify({ error: "OSS 配置不完整" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 获取 STS 临时凭证
    const stsCredentials = await getSTSCredentials(
      accessKeyId,
      accessKeySecret,
      roleArn,
      bucket,
      user.id  // 传入用户ID用于策略限制
    );

    // 返回凭证（前端直传使用）
    return new Response(JSON.stringify({
      accessKeyId: stsCredentials.AccessKeyId,
      accessKeySecret: stsCredentials.AccessKeySecret,
      securityToken: stsCredentials.SecurityToken,
      expiration: stsCredentials.Expiration,
      region: region,
      bucket: bucket,
      endpoint: endpoint,  // 返回完整的 endpoint
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("STS 错误:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function getSTSCredentials(
  accessKeyId: string,
  accessKeySecret: string,
  roleArn: string | undefined,
  bucket: string,
  userId: string
) {
  // 如果没有配置 RAM 角色，返回警告并继续（不推荐生产环境使用）
  if (!roleArn) {
    console.warn("警告：未配置 OSS_ROLE_ARN，使用主 AccessKey（不安全）");
    return {
      AccessKeyId: accessKeyId,
      AccessKeySecret: accessKeySecret,
      SecurityToken: "",
      Expiration: new Date(Date.now() + 3600 * 1000).toISOString(),
    };
  }

  // 使用阿里云官方 STS 端点
  const stsEndpoint = "https://sts.aliyuncs.com";

  // 构建请求参数
  const params: Record<string, string> = {
    Action: "AssumeRole",
    Format: "JSON",
    Version: "2015-04-01",
    AccessKeyId: accessKeyId,
    SignatureMethod: "HMAC-SHA1",
    SignatureVersion: "1.0",
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    SignatureNonce: crypto.randomUUID(),
    RoleArn: roleArn,
    RoleSessionName: `user-${userId.substring(0, 8)}-${Date.now()}`,
    DurationSeconds: "900",  // 15分钟，足够上传
    Policy: JSON.stringify({
      Version: "1",
      Statement: [
        {
          Effect: "Allow",
          Action: [
            "oss:PutObject",
            "oss:GetObject",
            "oss:ListObjects"
          ],
          Resource: [
            `acs:oss:*:*:${bucket}`,
            `acs:oss:*:*:${bucket}/*`,
            `acs:oss:*:*:${bucket}/uploads/${userId}/*`  // 限制只能上传到自己的目录
          ],
        },
      ],
    }),
  };

  // 计算签名（修复版）
  const signature = await computeSignature(accessKeySecret, params);

  // 添加签名到参数
  const signedParams = { ...params, Signature: signature };

  // 构建请求 URL
  const queryString = Object.entries(signedParams)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");

  const url = `${stsEndpoint}?${queryString}`;

  // 发送请求
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Accept": "application/json",
    },
  });

  const data = await response.json();

  if (data.Code) {
    console.error("STS Error Response:", data);
    throw new Error(`STS 错误: ${data.Message || data.Code}`);
  }

  return data.Credentials;
}

async function computeSignature(accessKeySecret: string, params: Record<string, string>): Promise<string> {
  // 1. 参数排序
  const sortedKeys = Object.keys(params).sort();

  // 2. 构建规范化查询字符串
  const canonicalizedQueryString = sortedKeys
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join("&");

  // 3. 构建待签名字符串
  const stringToSign = `GET&${encodeURIComponent("/")}&${encodeURIComponent(canonicalizedQueryString)}`;

  // 4. 计算 HMAC-SHA1
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(accessKeySecret + "&"),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(stringToSign)
  );

  // 5. Base64 编码
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}