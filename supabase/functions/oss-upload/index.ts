import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const fileName = formData.get("fileName");

    if (!file || !fileName) {
      return new Response(JSON.stringify({ error: "缺少文件" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessKeyId = Deno.env.get("OSS_ACCESS_KEY_ID");
    const accessKeySecret = Deno.env.get("OSS_ACCESS_KEY_SECRET");
    const bucket = Deno.env.get("OSS_BUCKET");
    const region = Deno.env.get("OSS_REGION");

    const endpoint = `https://${bucket}.${region}.aliyuncs.com`;
    const date = new Date().toUTCString();
    const contentType = (file as File).type || "application/octet-stream";
    const path = `/${fileName}`;

    const stringToSign = `PUT\n\n${contentType}\n${date}\n/${bucket}${path}`;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(accessKeySecret),
      { name: "HMAC", hash: "SHA-1" },
      false,
      ["sign"]
    );

    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(stringToSign)
    );

    const signatureB64 = btoa(
      String.fromCharCode(...new Uint8Array(signature))
    );

    const arrayBuffer = await (file as File).arrayBuffer();

    const uploadResponse = await fetch(`${endpoint}${path}`, {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
        "Date": date,
        "Authorization": `OSS ${accessKeyId}:${signatureB64}`,
      },
      body: arrayBuffer,
    });

    if (!uploadResponse.ok) {
      const errText = await uploadResponse.text();
      throw new Error(`OSS 上传失败: ${errText}`);
    }

    const url = `${endpoint}${path}`;

    return new Response(JSON.stringify({ url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});