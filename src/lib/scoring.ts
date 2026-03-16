import type { ScoreResult, ScoreDetail } from '../types';
import type { AIScoreResult } from './translate';

// ── 基础工具 ──────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^\w\s\u4e00-\u9fff]/g, ' ').split(/\s+/).filter(t => t.length > 0);
}

function wordCoverage(userTokens: string[], refTokens: string[]): number {
  if (refTokens.length === 0) return 1;
  const refSet = new Set(refTokens);
  const userSet = new Set(userTokens);
  let hit = 0;
  refSet.forEach(w => { if (userSet.has(w)) hit++; });
  return hit / refSet.size;
}

function ngramPrecision(userTokens: string[], refTokens: string[], n: number): number {
  if (userTokens.length < n || refTokens.length < n) return 0;
  const refNgrams = new Map<string, number>();
  for (let i = 0; i <= refTokens.length - n; i++) {
    const key = refTokens.slice(i, i + n).join('|');
    refNgrams.set(key, (refNgrams.get(key) ?? 0) + 1);
  }
  let matches = 0;
  for (let i = 0; i <= userTokens.length - n; i++) {
    const key = userTokens.slice(i, i + n).join('|');
    const cnt = refNgrams.get(key) ?? 0;
    if (cnt > 0) { matches++; refNgrams.set(key, cnt - 1); }
  }
  return matches / (userTokens.length - n + 1);
}

function countSentences(text: string): number {
  return text.split(/[。.！!？?]+/).filter(s => s.trim().length > 0).length;
}

function countFillers(text: string): number {
  const fillers = ['那个','就是','然后','这个','嗯','啊','呃','好像','就是说','um','uh','like','you know','basically','actually'];
  const lower = text.toLowerCase();
  return fillers.reduce((cnt, f) => {
    const m = lower.match(new RegExp(f, 'g'));
    return cnt + (m ? m.length : 0);
  }, 0);
}

function lexicalDiversity(tokens: string[]): number {
  if (tokens.length === 0) return 0;
  return new Set(tokens).size / tokens.length;
}

function lengthRatio(userTokens: string[], refTokens: string[]): number {
  if (refTokens.length === 0) return 1;
  return userTokens.length / refTokens.length;
}

// ── 三大维度评分 ──────────────────────────────────────────────

function scoreContent(userTokens: string[], refTokens: string[], hasReference: boolean) {
  let coherenceScore: number, completenessScore: number, accuracyScore: number;

  if (hasReference && refTokens.length > 0) {
    const coverage = wordCoverage(userTokens, refTokens);
    const uni = ngramPrecision(userTokens, refTokens, 1);
    const bi  = ngramPrecision(userTokens, refTokens, 2);
    const ratio = lengthRatio(userTokens, refTokens);
    completenessScore = Math.round(coverage * 100);
    const bp = ratio < 0.5 ? ratio * 2 : 1;
    accuracyScore = Math.round((uni * 0.6 + bi * 0.4) * bp * 100);
    const ratioScore = ratio >= 0.6 && ratio <= 1.4 ? 1 : Math.max(0, 1 - Math.abs(ratio - 1));
    const sentences = countSentences(userTokens.join(' '));
    const structScore = sentences > 0 ? Math.min(1, sentences / Math.max(1, countSentences(refTokens.join(' ')))) : 0.5;
    coherenceScore = Math.round((ratioScore * 0.5 + structScore * 0.5) * 100);
  } else {
    const diversity = lexicalDiversity(userTokens);
    const sentences = countSentences(userTokens.join(' '));
    const avgLen = sentences > 0 ? userTokens.length / sentences : 0;
    completenessScore = Math.min(100, Math.round(userTokens.length * 2));
    accuracyScore = Math.round(diversity * 100);
    coherenceScore = avgLen >= 5 && avgLen <= 40 ? 75 : 60;
  }

  completenessScore = Math.min(100, Math.max(0, completenessScore));
  accuracyScore     = Math.min(100, Math.max(0, accuracyScore));
  coherenceScore    = Math.min(100, Math.max(0, coherenceScore));

  const score = Math.round(coherenceScore * 0.3 + completenessScore * 0.35 + accuracyScore * 0.35);

  const feedbackParts: string[] = [];
  if (coherenceScore >= 75) feedbackParts.push('逻辑连贯，结构清晰');
  else feedbackParts.push('逻辑连贯性有待提升');
  if (completenessScore >= 75) feedbackParts.push('主要信息点覆盖完整');
  else if (completenessScore >= 55) feedbackParts.push('部分信息点遗漏');
  else feedbackParts.push('信息遗漏较多，建议加强笔记和记忆训练');
  if (accuracyScore >= 75) feedbackParts.push('语义传递准确');
  else if (accuracyScore >= 55) feedbackParts.push('存在部分偏译');
  else feedbackParts.push('出现明显误译，需加强对原文的理解');

  return { score: Math.min(100, Math.max(0, score)), feedback: feedbackParts.join('；'), sub: { coherenceScore, completenessScore, accuracyScore } };
}

function scoreDelivery(userText: string, userTokens: string[]) {
  if (userTokens.length < 15) {
    const penalty = userTokens.length / 15;
    return { score: Math.round(penalty * 40), feedback: '内容不足，无法准确评估表达质量', sub: { languageScore: 0, fluencyScore: 0, profScore: 0 } };
  }
  const diversity = lexicalDiversity(userTokens);
  const fillers = countFillers(userText);
  const sentences = countSentences(userText);
  const avgLen = sentences > 0 ? userTokens.length / sentences : 0;
  const languageScore = Math.round(Math.min(diversity * 120, 100));
  const fillerPenalty = Math.max(0, 1 - fillers * 0.08);
  const lenScore = avgLen >= 5 && avgLen <= 35 ? 1 : avgLen > 0 ? 0.7 : 0.4;
  const fluencyScore = Math.round(fillerPenalty * lenScore * 100);
  const profScore = Math.min(100, Math.round((diversity >= 0.6 ? 85 : diversity >= 0.4 ? 70 : 55) + (avgLen >= 10 ? 10 : 0)));
  const score = Math.round(Math.min(100, languageScore * 0.35 + fluencyScore * 0.40 + profScore * 0.25));

  const feedbackParts: string[] = [];
  if (languageScore >= 75) feedbackParts.push('目标语言表达地道，词汇丰富');
  else feedbackParts.push('词汇较为单一，建议扩充目标语言词汇量');
  if (fluencyScore >= 75) feedbackParts.push('表达流畅，节奏良好');
  else if (fillers >= 3) feedbackParts.push(`冗余填充词过多（约 ${fillers} 处）`);
  else feedbackParts.push('表达流畅度有待提升');
  if (avgLen < 3 && sentences > 0) feedbackParts.push('句子过短，注意完整性');

  return { score: Math.min(100, Math.max(0, score)), feedback: feedbackParts.join('；'), sub: { languageScore, fluencyScore, profScore } };
}

function scoreTechnique(userTokens: string[], refTokens: string[], hasReference: boolean) {
  const ratio = hasReference && refTokens.length > 0 ? lengthRatio(userTokens, refTokens) : 1;
  const sentences = countSentences(userTokens.join(' '));
  const diversity = lexicalDiversity(userTokens);
  const condensingScore = ratio >= 0.55 && ratio <= 1.3 ? 85 : ratio < 0.3 ? 50 : ratio > 1.6 ? 60 : 70;
  const avgLen = sentences > 0 ? userTokens.length / sentences : 0;
  const monitoringScore = avgLen >= 6 ? 85 : avgLen >= 3 ? 70 : 55;
  const strategyScore = Math.round(Math.min(diversity * 130, 95));
  const score = Math.round(condensingScore * 0.35 + monitoringScore * 0.35 + strategyScore * 0.30);

  const feedbackParts: string[] = [];
  if (condensingScore >= 80) feedbackParts.push('信息浓缩处理得当');
  else if (ratio < 0.4) feedbackParts.push('输出内容偏少，建议使用信息浓缩而非省略');
  else feedbackParts.push('注意控制输出长度，避免不必要的重复');
  if (monitoringScore >= 80) feedbackParts.push('句子完整，能有效监控输出');
  else feedbackParts.push('注意句子完整性，避免未完成的句子');
  if (strategyScore >= 75) feedbackParts.push('释义和转换策略运用较好');
  else feedbackParts.push('建议多运用释义、归纳等口译技巧');

  return { score: Math.min(100, Math.max(0, score)), feedback: feedbackParts.join('；'), sub: { condensingScore, monitoringScore, strategyScore } };
}

// ── 主评分函数 ────────────────────────────────────────────────

export function calculateScore(
  userTranscription: string,
  referenceTranslation: string,
  userDurationSec: number = 0,
  sourceDurationSec: number = 0
): ScoreResult {
  const userTokens = tokenize(userTranscription);
  const refTokens  = tokenize(referenceTranslation);
  const hasReference = referenceTranslation.trim().length > 0;
  const userCharCount = userTranscription.trim().length;
  const userWordCount = userTokens.length;

  // ── 无内容 ────────────────────────────────────────────────
  if (userCharCount === 0 || userWordCount === 0) {
    return {
      overall: 0, accuracy: 0, completeness: 0, fluency: 0,
      details: [{ category: '无有效内容', score: 0, feedback: '未检测到口译内容，请确保录音正常并重新练习。' }],
    };
  }

  // ── 内容极少 ──────────────────────────────────────────────
  if (userWordCount < 5 && userCharCount < 10) {
    return {
      overall: 10, accuracy: 10, completeness: 5, fluency: 10,
      details: [
        { category: '内容（Content）',  score: 10, feedback: '口译内容极少，无法有效评估。请完整表达原文内容后再提交。' },
        { category: '表达（Delivery）', score: 10, feedback: '内容不足，无法评估表达质量。' },
        { category: '技巧（Technique）',score: 10, feedback: '内容不足，无法评估口译技巧。' },
        { category: '综合评价',          score: 10, feedback: '本次口译内容严重不足，建议重新练习，尝试完整传达原文信息。' },
      ],
    };
  }

  // ── 内容较少 ──────────────────────────────────────────────
  if (userWordCount < 15) {
    const baseScore = Math.round(userWordCount / 15 * 40);
    return {
      overall: baseScore,
      accuracy: baseScore,
      completeness: Math.round(baseScore * 0.6),
      fluency: Math.round(baseScore * 0.8),
      details: [
        { category: '内容（Content）',  score: Math.round(baseScore * 0.9), feedback: `口译内容过少（约 ${userWordCount} 个词），大量信息未传达。` },
        { category: '表达（Delivery）', score: Math.round(baseScore * 0.8), feedback: '内容太短，无法充分评估语言表达质量。' },
        { category: '技巧（Technique）',score: Math.round(baseScore * 0.7), feedback: '内容太短，无法评估口译策略和技巧运用。' },
        { category: '综合评价',          score: baseScore,                   feedback: `口译内容明显不足，仅传达了少量信息。建议练习时尽量完整传达原文内容。` },
      ],
    };
  }

  // ── 时长覆盖率惩罚 ────────────────────────────────────────
  let coveragePenalty = 1.0;
  let coveragePercent = 0;
  if (sourceDurationSec > 0 && userDurationSec > 0) {
    const ratio = userDurationSec / sourceDurationSec;
    coveragePercent = Math.round(ratio * 100);
    if (ratio < 0.3)       coveragePenalty = 0.30;
    else if (ratio < 0.5)  coveragePenalty = 0.50;
    else if (ratio < 0.7)  coveragePenalty = 0.75;
    console.log(`时长覆盖率: ${coveragePercent}%，惩罚系数: ${coveragePenalty}`);
  }

  // ── 正常评分 ──────────────────────────────────────────────
  const content   = scoreContent(userTokens, refTokens, hasReference);
  const delivery  = scoreDelivery(userTranscription, userTokens);
  const technique = scoreTechnique(userTokens, refTokens, hasReference);

  const rawOverall = Math.round(content.score * 0.40 + delivery.score * 0.35 + technique.score * 0.25);
  const overall    = Math.min(100, Math.max(0, Math.round(rawOverall * coveragePenalty)));

  const accuracy     = Math.round((content.sub.accuracyScore + content.sub.coherenceScore) / 2);
  const completeness = content.sub.completenessScore;
  const fluency      = delivery.sub.fluencyScore;

  // 综合评价
  const coverageNote = coveragePercent > 0 && coveragePercent < 70
    ? `本次口译仅覆盖原文约 ${coveragePercent}% 的时长，大量内容未传达。` : '';

  let overallFeedback: string;
  if (overall >= 85)      overallFeedback = coverageNote || '优秀！三个维度表现均衡，口译质量高，请继续保持。';
  else if (overall >= 75) overallFeedback = (coverageNote || '') + '具备扎实的口译基础，建议重点提升得分较低的维度。';
  else if (overall >= 60) overallFeedback = (coverageNote || '') + '有一定口译能力，但内容完整性和表达流畅度仍需加强。';
  else                    overallFeedback = (coverageNote || '') + '需要加强练习，建议从简单材料入手，逐步提升内容传递的准确性和完整性。';

  return {
    overall, accuracy, completeness, fluency,
    details: [
      { category: '内容（Content）',  score: content.score,   feedback: content.feedback   },
      { category: '表达（Delivery）', score: delivery.score,  feedback: delivery.feedback  },
      { category: '技巧（Technique）',score: technique.score, feedback: technique.feedback },
      { category: '综合评价',          score: overall,         feedback: overallFeedback    },
    ],
  };
}

// ── AI 评分结果转 ScoreResult ─────────────────────────────────

export function buildScoreFromAI(ai: AIScoreResult): ScoreResult {
  const overall      = Math.min(100, Math.max(0, Math.round(ai.overall.score)));
  const accuracy     = Math.min(100, Math.max(0, Math.round((ai.content.score * 0.6 + ai.delivery.score * 0.4))));
  const completeness = Math.min(100, Math.max(0, Math.round(ai.content.score)));
  const fluency      = Math.min(100, Math.max(0, Math.round(ai.delivery.score)));

  return {
    overall, accuracy, completeness, fluency,
    details: [
      { category: '内容（Content）',  score: Math.round(ai.content.score),   feedback: ai.content.feedback   },
      { category: '表达（Delivery）', score: Math.round(ai.delivery.score),  feedback: ai.delivery.feedback  },
      { category: '技巧（Technique）',score: Math.round(ai.technique.score), feedback: ai.technique.feedback },
      { category: '综合评价',          score: overall,                        feedback: ai.overall.feedback   },
    ],
  };
}

// ── 等级 ──────────────────────────────────────────────────────

export function getGrade(score: number): { grade: string; color: string } {
  if (score >= 90) return { grade: 'A+', color: 'text-green-600' };
  if (score >= 85) return { grade: 'A',  color: 'text-green-500' };
  if (score >= 80) return { grade: 'B+', color: 'text-blue-600'  };
  if (score >= 75) return { grade: 'B',  color: 'text-blue-500'  };
  if (score >= 70) return { grade: 'C+', color: 'text-yellow-600'};
  if (score >= 60) return { grade: 'C',  color: 'text-yellow-500'};
  if (score >= 50) return { grade: 'D',  color: 'text-orange-500'};
  return             { grade: 'F',  color: 'text-red-500'    };
}