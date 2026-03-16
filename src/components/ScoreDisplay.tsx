import React from 'react';
import { Trophy, BookOpen, Mic2, Lightbulb, Volume2 } from 'lucide-react';
import type { ScoreResult } from '../types';
import { getGrade } from '../lib/scoring';

interface Props {
  score: ScoreResult;
  transcription: string;
  reference?: string;
  audioUrl: string | null;
  whisperLoading?: boolean;
  whisperStep?: string;
}

export function ScoreDisplay({
  score, transcription, reference, audioUrl, whisperLoading, whisperStep
}: Props) {
  const grade = getGrade(score.overall);

  const getBarColor = (v: number) =>
    v >= 80 ? 'bg-green-500' : v >= 65 ? 'bg-blue-500' : v >= 50 ? 'bg-yellow-500' : 'bg-red-500';

  const getTextColor = (v: number) =>
    v >= 80 ? 'text-green-600' : v >= 65 ? 'text-blue-600' : v >= 50 ? 'text-yellow-600' : 'text-red-600';

  const getBgBorder = (v: number) =>
    v >= 80 ? 'bg-green-50 border-green-200' :
    v >= 65 ? 'bg-blue-50 border-blue-200' :
    v >= 50 ? 'bg-yellow-50 border-yellow-200' :
    'bg-red-50 border-red-200';

  const contentDetail   = score.details.find(d => d.category.includes('Content'));
  const deliveryDetail  = score.details.find(d => d.category.includes('Delivery'));
  const techniqueDetail = score.details.find(d => d.category.includes('Technique'));
  const overallDetail   = score.details.find(d => d.category.includes('综合'));

  const dimensions = [
    {
      icon: <BookOpen className="w-5 h-5" />,
      label: '内容', sublabel: 'Content', weight: '40%',
      desc: '连贯性 · 完整性 · 准确性',
      detail: contentDetail,
    },
    {
      icon: <Mic2 className="w-5 h-5" />,
      label: '表达', sublabel: 'Delivery', weight: '35%',
      desc: '语言质量 · 流畅度 · 专业性',
      detail: deliveryDetail,
    },
    {
      icon: <Lightbulb className="w-5 h-5" />,
      label: '技巧', sublabel: 'Technique', weight: '25%',
      desc: '口译策略 · 信息处理 · 输出监控',
      detail: techniqueDetail,
    },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* 处理进度提示 */}
      {whisperLoading && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <span className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-blue-700">
                {whisperStep || '处理中，请稍候…'}
              </p>
              <div className="flex items-center gap-2 mt-2">
                {['转录口译录音', '转录原文', '生成参考译文', '计算评分'].map((step, i) => {
                  const stepKeys = ['转录你的口译', '转录原文', '生成参考', '计算评分'];
                  const active = whisperStep?.includes(stepKeys[i] ?? step);
                  const done = !whisperLoading && i < 3;
                  return (
                    <div key={step} className="flex items-center gap-1">
                      <div className={`w-2 h-2 rounded-full ${active ? 'bg-blue-500 animate-pulse' : done ? 'bg-green-400' : 'bg-gray-300'}`} />
                      <span className={`text-xs ${active ? 'text-blue-600 font-medium' : 'text-gray-400'}`}>{step}</span>
                      {i < 3 && <span className="text-gray-300 text-xs mx-1">→</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 总分卡片 */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center justify-between gap-6">
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-gray-800 mb-1">练习完成</h2>
            <p className="text-sm text-gray-500 mb-3">
              评分基于 AIIC 口译评分标准，分内容、表达、技巧三个维度
            </p>
            {overallDetail && (
              <p className="text-sm text-gray-600 leading-relaxed">{overallDetail.feedback}</p>
            )}
          </div>
          <div className="flex-shrink-0 text-center">
            <div className="w-28 h-28 rounded-full border-4 border-indigo-100 flex items-center justify-center mb-2">
              <div>
                <div className={`text-4xl font-bold ${getTextColor(score.overall)}`}>
                  {score.overall}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">总分</div>
              </div>
            </div>
            <div className={`text-2xl font-bold ${getTextColor(score.overall)}`}>
              {grade.grade}
            </div>
          </div>
        </div>
        <div className="mt-4 h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full ${getBarColor(score.overall)} transition-all duration-700`}
            style={{ width: `${score.overall}%` }}
          />
        </div>
      </div>

      {/* 三大维度 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {dimensions.map(dim => (
          <div key={dim.label} className={`rounded-2xl border p-5 ${dim.detail ? getBgBorder(dim.detail.score) : 'bg-gray-50 border-gray-200'}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-white rounded-lg text-indigo-600 shadow-sm">
                  {dim.icon}
                </div>
                <div>
                  <div className="font-semibold text-gray-800 text-sm">{dim.label}</div>
                  <div className="text-xs text-gray-400">{dim.sublabel} · {dim.weight}</div>
                </div>
              </div>
              <div className={`text-2xl font-bold ${dim.detail ? getTextColor(dim.detail.score) : 'text-gray-400'}`}>
                {dim.detail?.score ?? '—'}
              </div>
            </div>
            <div className="h-1.5 bg-white/60 rounded-full overflow-hidden mb-3">
              <div
                className={`h-full ${dim.detail ? getBarColor(dim.detail.score) : 'bg-gray-300'} transition-all duration-700`}
                style={{ width: `${dim.detail?.score ?? 0}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mb-1">{dim.desc}</p>
            {dim.detail && (
              <p className="text-xs text-gray-600 leading-relaxed">{dim.detail.feedback}</p>
            )}
          </div>
        ))}
      </div>

      {/* 细项参考 */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">细项参考</h3>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: '准确性', value: score.accuracy,     desc: '语义传递' },
            { label: '完整性', value: score.completeness, desc: '信息覆盖' },
            { label: '流畅度', value: score.fluency,       desc: '表达自然度' },
          ].map(item => (
            <div key={item.label} className="text-center">
              <div className={`text-2xl font-bold ${getTextColor(item.value)}`}>{item.value}</div>
              <div className="text-xs font-medium text-gray-700 mt-0.5">{item.label}</div>
              <div className="text-xs text-gray-400">{item.desc}</div>
              <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full ${getBarColor(item.value)} transition-all duration-700`}
                  style={{ width: `${item.value}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 录音回放 */}
      {audioUrl && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-indigo-500" /> 录音回放
          </h3>
          <audio src={audioUrl} controls className="w-full" />
        </div>
      )}

      {/* 转写对比 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">你的口译（Whisper 转写）</h3>
          <div className="p-4 bg-gray-50 rounded-xl min-h-[120px]">
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
              {transcription || '（未能识别到内容）'}
            </p>
          </div>
        </div>
        {reference ? (
          <div className="bg-white rounded-2xl border border-green-200 p-5">
            <h3 className="text-sm font-semibold text-green-700 mb-3 flex items-center gap-2">
              参考译文
              <span className="text-xs font-normal text-green-500 bg-green-100 px-2 py-0.5 rounded-full">
                AI 生成
              </span>
            </h3>
            <div className="p-4 bg-green-50 rounded-xl min-h-[120px]">
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{reference}</p>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 p-5 flex items-center justify-center">
            <div className="text-center text-gray-400">
              <p className="text-sm">未提供参考译文</p>
              <p className="text-xs mt-1">评分基于输出质量自身分析</p>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}