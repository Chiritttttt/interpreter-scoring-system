import { supabase } from './supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

/**
 * OSS 上传凭证
 */
interface OSSCredentials {
  accessKeyId: string;
  accessKeySecret: string;
  securityToken: string;
  expiration: string;
  region: string;
  bucket: string;
}

/**
 * 获取 OSS 上传凭证（带缓存，自动刷新即将过期的凭证）
 */
async function getOSSCredentials(): Promise<OSSCredentials> {
  // 如果有缓存的凭证且未过期（距离过期还有超过 60 秒），直接复用
  if (StorageService.cachedCredentials && StorageService.credentialsExpireAt > Date.now() + 60_000) {
    return StorageService.cachedCredentials;
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('未登录');

  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/oss-sts`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
    }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error ?? `获取凭证失败 (${response.status})`);
  }

  const credentials = await response.json();
  // 缓存凭证及其过期时间
  StorageService.cachedCredentials = credentials;
  StorageService.credentialsExpireAt = new Date(credentials.expiration).getTime();
  return credentials;
}

/**
 * 生成 OSS 签名
 */
async function generateOSSSignature(
  method: string,
  contentType: string,
  date: string,
  resource: string,
  accessKeySecret: string,
  securityToken?: string
): Promise<string> {
  let stringToSign = `${method}\n\n${contentType}\n${date}\n`;

  if (securityToken) {
    stringToSign += `x-oss-security-token:${securityToken}\n`;
  }

  stringToSign += resource;

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

  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

/**
 * 上传音视频文件到阿里云 OSS（客户端直传）
 *
 * 优点：
 * - 不经过服务器中转，速度最快
 * - 支持大文件分片上传（>5MB 自动启用）
 * - 真实的上传进度回调
 * - 不受 Edge Function 限制
 *
 * @param file 要上传的文件
 * @param onProgress 进度回调函数
 * @returns 文件的公开访问 URL
 */
export async function uploadMediaToOSS(
  file: File,
  onProgress?: (percent: number) => void
): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('未登录');

  // 获取上传凭证
  onProgress?.(5);
  const credentials = await getOSSCredentials();

  // 生成唯一文件名，按用户 ID 分目录
  const userId = session.user.id;
  const ext = file.name.split('.').pop() ?? 'webm';
  const fileName = `${userId}/${Date.now()}.${ext}`;

  const endpoint = `https://${credentials.bucket}.${credentials.region}.aliyuncs.com`;
  const objectKey = fileName;
  const resource = `/${credentials.bucket}/${objectKey}`;

  // 大文件使用分片上传（>5MB）
  const CHUNK_SIZE = 5 * 1024 * 1024;
  const useMultipart = file.size > CHUNK_SIZE;

  if (useMultipart) {
    return await multipartUpload(
      file, credentials, endpoint, objectKey, resource, onProgress
    );
  }

  // 小文件直接上传
  return await simpleUpload(
    file, credentials, endpoint, objectKey, resource, onProgress
  );
}

/**
 * 简单上传（小文件，<5MB）
 */
async function simpleUpload(
  file: File,
  credentials: OSSCredentials,
  endpoint: string,
  objectKey: string,
  resource: string,
  onProgress?: (percent: number) => void
): Promise<string> {
  const date = new Date().toUTCString();
  const contentType = file.type || 'application/octet-stream';

  const signature = await generateOSSSignature(
    'PUT', contentType, date, resource,
    credentials.accessKeySecret, credentials.securityToken
  );

  onProgress?.(20);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 80) + 20;
        onProgress?.(percent);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve(`${endpoint}/${objectKey}`);
      } else {
        reject(new Error(`上传失败: ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('网络错误')));
    xhr.addEventListener('abort', () => reject(new Error('上传已取消')));

    xhr.open('PUT', `${endpoint}/${objectKey}`);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.setRequestHeader('Date', date);
    xhr.setRequestHeader('Authorization', `OSS ${credentials.accessKeyId}:${signature}`);

    if (credentials.securityToken) {
      xhr.setRequestHeader('x-oss-security-token', credentials.securityToken);
    }

    xhr.send(file);
  });
}

/**
 * 分片上传（大文件，>=5MB）
 *
 * 每个分片上传前会调用 getOSSCredentials() 确保凭证有效。
 * 如果 STS token 即将过期（<60s），会自动刷新。
 */
async function multipartUpload(
  file: File,
  initialCredentials: OSSCredentials,
  endpoint: string,
  objectKey: string,
  resource: string,
  onProgress?: (percent: number) => void
): Promise<string> {
  const CHUNK_SIZE = 5 * 1024 * 1024;
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  const contentType = file.type || 'application/octet-stream';

  onProgress?.(10);

  // 1. 初始化分片上传
  const credentials = initialCredentials;
  const initDate = new Date().toUTCString();
  const initResource = `/${credentials.bucket}/${objectKey}?uploads`;
  const initSignature = await generateOSSSignature(
    'POST', contentType, initDate, initResource,
    credentials.accessKeySecret, credentials.securityToken
  );

  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Date': initDate,
    'Authorization': `OSS ${credentials.accessKeyId}:${initSignature}`,
  };

  if (credentials.securityToken) {
    headers['x-oss-security-token'] = credentials.securityToken;
  }

  const initResponse = await fetch(`${endpoint}/${objectKey}?uploads`, {
    method: 'POST',
    headers,
  });

  if (!initResponse.ok) {
    throw new Error(`初始化分片上传失败`);
  }

  const initText = await initResponse.text();
  const uploadIdMatch = initText.match(/<UploadId>([^<]+)<\/UploadId>/);
  if (!uploadIdMatch) throw new Error('无法获取 UploadId');
  const uploadId = uploadIdMatch[1];

  onProgress?.(15);

  // 2. 上传各分片
  const parts: { partNumber: number; etag: string }[] = [];
  let uploadedBytes = 0;

  for (let i = 0; i < totalChunks; i++) {
    // 每个分片上传前确保凭证有效（自动刷新即将过期的凭证）
    const currentCredentials = await getOSSCredentials();

    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);
    const partNumber = i + 1;

    const chunkDate = new Date().toUTCString();
    const chunkResource = `/${currentCredentials.bucket}/${objectKey}?partNumber=${partNumber}&uploadId=${uploadId}`;
    const chunkSignature = await generateOSSSignature(
      'PUT', contentType, chunkDate, chunkResource,
      currentCredentials.accessKeySecret, currentCredentials.securityToken
    );

    const chunkHeaders: Record<string, string> = {
      'Content-Type': contentType,
      'Date': chunkDate,
      'Authorization': `OSS ${currentCredentials.accessKeyId}:${chunkSignature}`,
    };

    if (currentCredentials.securityToken) {
      chunkHeaders['x-oss-security-token'] = currentCredentials.securityToken;
    }

    const chunkResponse = await fetch(
      `${endpoint}/${objectKey}?partNumber=${partNumber}&uploadId=${uploadId}`,
      { method: 'PUT', headers: chunkHeaders, body: chunk }
    );

    if (!chunkResponse.ok) {
      throw new Error(`上传分片 ${partNumber} 失败`);
    }

    const etag = chunkResponse.headers.get('ETag');
    if (!etag) throw new Error(`无法获取分片 ETag`);

    parts.push({ partNumber, etag: etag.replace(/"/g, '') });
    uploadedBytes += end - start;

    const progress = Math.round((uploadedBytes / file.size) * 75) + 15;
    onProgress?.(progress);
  }

  // 3. 完成分片上传（使用最新凭证）
  const finalCredentials = await getOSSCredentials();
  const completeDate = new Date().toUTCString();
  const completeResource = `/${finalCredentials.bucket}/${objectKey}?uploadId=${uploadId}`;
  const completeSignature = await generateOSSSignature(
    'POST', 'application/xml', completeDate, completeResource,
    finalCredentials.accessKeySecret, finalCredentials.securityToken
  );

  const completeBody = `<?xml version="1.0" encoding="UTF-8"?>
<CompleteMultipartUpload>
${parts.map(p => `  <Part><PartNumber>${p.partNumber}</PartNumber><ETag>"${p.etag}"</ETag></Part>`).join('\n')}
</CompleteMultipartUpload>`;

  const completeHeaders: Record<string, string> = {
    'Content-Type': 'application/xml',
    'Date': completeDate,
    'Authorization': `OSS ${finalCredentials.accessKeyId}:${completeSignature}`,
  };

  if (finalCredentials.securityToken) {
    completeHeaders['x-oss-security-token'] = finalCredentials.securityToken;
  }

  const completeResponse = await fetch(
    `${endpoint}/${objectKey}?uploadId=${uploadId}`,
    { method: 'POST', headers: completeHeaders, body: completeBody }
  );

  if (!completeResponse.ok) {
    throw new Error(`完成分片上传失败`);
  }

  onProgress?.(100);
  return `${endpoint}/${objectKey}`;
}

/**
 * StorageService — 提供 STS 凭证缓存的静态容器
 */
class StorageService {
  private static cachedCredentials: OSSCredentials | null = null;
  private static credentialsExpireAt: number = 0;
}
