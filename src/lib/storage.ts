import { supabase } from './supabase';

const SUPABASE_URL = (import.meta as any).env.VITE_SUPABASE_URL;

/**
 * 上传音视频文件到阿里云 OSS（通过 Supabase Edge Function 中转）
 * 返回文件的公开访问 URL
 */
export async function uploadMediaToOSS(
  file: File,
  onProgress?: (percent: number) => void
): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('未登录');

  // 生成唯一文件名，按用户 ID 分目录
  const userId = session.user.id;
  const ext = file.name.split('.').pop() ?? 'webm';
  const fileName = `${userId}/${Date.now()}.${ext}`;

  onProgress?.(10);

  const formData = new FormData();
  formData.append('file', file);
  formData.append('fileName', fileName);

  onProgress?.(30);

  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/oss-upload`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: formData,
    }
  );

  onProgress?.(90);

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error ?? `上传失败 (${response.status})`);
  }

  const data = await response.json();
  onProgress?.(100);
  return data.url;
}