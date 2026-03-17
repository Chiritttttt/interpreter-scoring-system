const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

// ── Whisper 服务地址（可在设置里修改）────────────────────────
function getWhisperUrl(): string {
  return 'https://bear-supervision-producer-when.trycloudflare.com/transcribe';
}

// ── DeepSeek API Key ──────────────────────────────────────────
export function getDeepSeekKey(): string {
  return (import.meta as any).env?.VITE_DEEPSEEK_API_KEY
    || localStorage.getItem('deepseek_api_key')
    || '';
}
export function setDeepSeekKey(key: string) {
  localStorage.setItem('deepseek_api_key', key);
}

// ── Whisper 本地转录 ──────────────────────────────────────────
export async function transcribeAudio(
  file: File | Blob,
  language: 'en' | 'zh'
): Promise<string> {
  const formData = new FormData();
  if (file instanceof Blob && !(file instanceof File)) {
    formData.append('file', file, 'recording.webm');
  } else {
    formData.append('file', file);
  }
  formData.append('language', language === 'en' ? 'en' : 'zh');

  let response: Response;
  try {
    response = await fetch(getWhisperUrl(), { method: 'POST', body: formData });
  } catch {
    throw new Error('无法连接本地 Whisper 服务，请确认 whisper_server.py 已运行，或在设置里修改服务地址');
  }
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error ?? `Whisper 转录失败 (${response.status})`);
  }
  const data = await response.json();
  return data.text ?? '';
}

// ── DeepSeek 生成参考译文 ─────────────────────────────────────
export async function generateReferenceTranslation(
  sourceText: string,
  sourceLanguage: 'en' | 'zh',
  interpretationType: string
): Promise<string> {
  const apiKey = getDeepSeekKey();
  if (!apiKey) throw new Error('未设置 DeepSeek API Key，请在设置页面填写');

  const targetLang = sourceLanguage === 'en' ? '中文' : '英文';
  const sourceLang = sourceLanguage === 'en' ? '英文' : '中文';
  const modeHint =
    interpretationType === 'consecutive'  ? '交替传译' :
    interpretationType === 'simultaneous' ? '同声传译' :
    interpretationType === 'sight'        ? '视译' : '口译';

  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: `你是一位专业口译员，请将以下${sourceLang}文本翻译成${targetLang}，作为${modeHint}的参考译文。
要求：
1. 忠实原文，准确传达原文含义，不随意增删
2. 语言自然流畅，符合${targetLang}表达习惯
3. 保留原文的语气和风格
4. 专业术语翻译准确
5. 只输出译文本身，不加任何解释或说明`,
        },
        { role: 'user', content: sourceText },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `DeepSeek 请求失败 (${response.status})`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() ?? '';
}

// ── 一键转录 + 翻译 ───────────────────────────────────────────
export async function transcribeAndTranslate(
  file: File,
  sourceLanguage: 'en' | 'zh',
  interpretationType: string,
  onProgress?: (step: 'transcribing' | 'translating') => void
): Promise<{ sourceText: string; referenceTranslation: string }> {
  onProgress?.('transcribing');
  const sourceText = await transcribeAudio(file, sourceLanguage);
  onProgress?.('translating');
  const referenceTranslation = await generateReferenceTranslation(sourceText, sourceLanguage, interpretationType);
  return { sourceText, referenceTranslation };
}

// ── AI 评分 ───────────────────────────────────────────────────
export interface AIScoreResult {
  content:   { score: number; feedback: string };
  delivery:  { score: number; feedback: string };
  technique: { score: number; feedback: string };
  overall:   { score: number; feedback: string };
}

export async function aiScoreInterpretation(
  userTranscription: string,
  referenceTranslation: string,
  sourceText: string,
  interpretationType: string,
  sourceLanguage: 'en' | 'zh',
  userDurationSec: number = 0,
  sourceDurationSec: number = 0
): Promise<AIScoreResult | null> {
  const apiKey = getDeepSeekKey();
  if (!apiKey) return null;

  const targetLang = sourceLanguage === 'en' ? '中文' : '英文';
  const sourceLang = sourceLanguage === 'en' ? '英文' : '中文';
  const modeHint =
    interpretationType === 'consecutive'  ? '交替传译' :
    interpretationType === 'simultaneous' ? '同声传译' :
    interpretationType === 'sight'        ? '视译' : '口译';

  const coverageRatio = sourceDurationSec > 0
    ? Math.round((userDurationSec / sourceDurationSec) * 100) : 0;

  const durationInfo = sourceDurationSec > 0
    ? `【时长信息】
原文音频总时长：${Math.round(sourceDurationSec)} 秒
学员口译录音时长：${Math.round(userDurationSec)} 秒
口译时长覆盖比例：约 ${coverageRatio}%` : '';

  const prompt = `你是一位专业口译考官，请根据 AIIC 口译评分标准对以下口译练习进行严格评分。

【口译模式】${modeHint}（${sourceLang} → ${targetLang}）

【原文】
${sourceText || '（未提供原文）'}

【参考译文】
${referenceTranslation || '（未提供参考译文）'}

【学员口译转写】
${userTranscription || '（无内容）'}

${durationInfo}

请从以下三个维度评分（0-100分），并给出简洁的中文反馈（每条不超过80字）：
1. 内容（Content，权重40%）：连贯性、完整性、准确性
2. 表达（Delivery，权重35%）：语言质量、流畅度、专业性
3. 技巧（Technique，权重25%）：口译策略、信息处理、输出监控

【严格评分标准】：
- 90-100：优秀，专业水准
- 75-89：良好，具备扎实基础
- 60-74：及格，有一定能力但明显不足
- 40-59：不及格，需要加强练习
- 0-39：很差，内容严重不足或错误

【强制扣分规则，必须严格执行】：
- 口译内容少于 10 个词：各维度最高不超过 20 分
- 覆盖比例 < 30%：内容分最高不超过 25 分，整体最高不超过 30 分
- 覆盖比例 30%~50%：内容分最高不超过 45 分，整体最高不超过 50 分
- 覆盖比例 50%~70%：内容分最高不超过 60 分，整体最高不超过 65 分
- 覆盖比例 > 70%：按正常标准评分
- 存在明显误译：准确性扣 20-30 分
- 大量信息遗漏：完整性每遗漏一个主要信息点扣 5-10 分

重要提醒：口译只覆盖了原文一小部分时，即使质量不错，整体分数也必须严格控制。

请严格按照以下 JSON 格式输出，不要有任何其他内容：
{
  "content": { "score": 分数, "feedback": "反馈内容" },
  "delivery": { "score": 分数, "feedback": "反馈内容" },
  "technique": { "score": 分数, "feedback": "反馈内容" },
  "overall": { "score": 综合加权分数, "feedback": "总体评价" }
}`;

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 1000,
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content?.trim() ?? '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const result = JSON.parse(jsonMatch[0]) as AIScoreResult;
    if (
      typeof result.content?.score === 'number' &&
      typeof result.delivery?.score === 'number' &&
      typeof result.technique?.score === 'number' &&
      typeof result.overall?.score === 'number'
    ) return result;
    return null;
  } catch (e) {
    console.error('AI 评分失败:', e);
    return null;
  }
}