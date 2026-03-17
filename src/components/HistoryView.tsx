import React, { useState, useEffect } from 'react';
import {
  History, Calendar, Award, TrendingUp, Trash2,
  Play, ChevronDown, ChevronUp, Download, Volume2,
  BookOpen, Mic2, Lightbulb, X
} from 'lucide-react';
import type { PracticeSession, PracticeMaterial, Topic } from '../types';
import * as db from '../lib/dbCloud';
import { getGrade } from '../lib/scoring';

export function HistoryView() {
  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  const [materials, setMaterials] = useState<PracticeMaterial[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<PracticeSession | null>(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [s, m, t] = await Promise.all([
      db.getAllSessions(),
      db.getAllMaterials(),
      db.getAllTopics(),
    ]);
    setSessions(s.sort((a, b) => b.startedAt - a.startedAt));
    setMaterials(m);
    setTopics(t);
    setLoading(false);
  }

  async function handleDelete(sessionId: string) {
    if (!confirm('确定要删除这条练习记录吗？')) return;
    await db.deleteSession(sessionId);
    if (selectedSession?.id === sessionId) setSelectedSession(null);
    await loadData();
  }

  const getMaterial = (id: string) => materials.find(m => m.id === id);
  const getTopic    = (id: string) => topics.find(t => t.id === id);

  const formatDate = (ts: number) =>
    new Date(ts).toLocaleDateString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });

  const formatDuration = (start: number, end?: number) => {
    if (!end) return '--';
    const s = Math.round((end - start) / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  const getModeLabel = (mode: string) => ({
    consecutive: '交替传译', simultaneous: '同声传译',
    sight: '视译', 'self-paced': '自由练习',
  }[mode] ?? mode);

  const getModeColor = (mode: string) => ({
    consecutive: 'bg-blue-100 text-blue-700',
    simultaneous: 'bg-purple-100 text-purple-700',
    sight: 'bg-green-100 text-green-700',
    'self-paced': 'bg-gray-100 text-gray-700',
  }[mode] ?? 'bg-gray-100 text-gray-700');

  // 下载录音
  function downloadRecording(session: PracticeSession, material?: PracticeMaterial) {
    if (!session.recordingBlob) return;
    const a = document.createElement('a');
    a.href = session.recordingBlob;
    a.download = `口译录音_${material?.title ?? '未知'}_${formatDate(session.startedAt).replace(/[/:]/g, '-')}.webm`;
    a.click();
  }

  // 统计
  const completed = sessions.filter(s => s.score);
  const avgScore = completed.length > 0
    ? Math.round(completed.reduce((sum, s) => sum + (s.score?.overall ?? 0), 0) / completed.length)
    : 0;
  const totalMin = Math.round(sessions.reduce((sum, s) => sum + (s.completedAt ? s.completedAt - s.startedAt : 0), 0) / 60000);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">

      {/* 统计卡片 */}
      <div className="p-6 bg-white border-b border-gray-200">
        <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <History className="w-6 h-6 text-indigo-500" /> 练习历史
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: <Calendar className="w-5 h-5" />, label: '总练习次数', value: sessions.length.toString(), color: 'bg-blue-500' },
            { icon: <Award className="w-5 h-5" />,    label: '完成评分',   value: completed.length.toString(), color: 'bg-green-500' },
            { icon: <TrendingUp className="w-5 h-5" />,label: '平均得分',   value: avgScore.toString(), color: 'bg-purple-500' },
            { icon: <Play className="w-5 h-5" />,     label: '总练习时长', value: `${totalMin} 分钟`, color: 'bg-orange-500' },
          ].map(c => (
            <div key={c.label} className="bg-gray-50 rounded-xl p-4 flex items-center gap-3">
              <div className={`p-3 rounded-lg ${c.color} text-white`}>{c.icon}</div>
              <div>
                <div className="text-2xl font-bold text-gray-800">{c.value}</div>
                <div className="text-sm text-gray-500">{c.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 列表 + 详情 */}
      <div className="flex-1 overflow-y-auto p-6">
        {sessions.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <History className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p className="text-lg">暂无练习记录</p>
            <p className="text-sm mt-2">开始练习后，你的记录将显示在这里</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map(session => {
              const material = getMaterial(session.materialId);
              const topic    = material ? getTopic(material.topicId) : null;
              const grade    = session.score ? getGrade(session.score.overall) : null;
              const isOpen   = selectedSession?.id === session.id;

              return (
                <div key={session.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">

                  {/* 列表行 */}
                  <div
                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition"
                    onClick={() => setSelectedSession(isOpen ? null : session)}
                  >
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      {/* 分数圆 */}
                      {session.score ? (
                        <div className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center flex-shrink-0 ${
                          session.score.overall >= 80 ? 'bg-green-100' :
                          session.score.overall >= 60 ? 'bg-yellow-100' : 'bg-red-100'
                        }`}>
                          <span className={`text-xl font-bold ${grade?.color}`}>{session.score.overall}</span>
                          <span className={`text-xs ${grade?.color}`}>{grade?.grade}</span>
                        </div>
                      ) : (
                        <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-gray-400 text-xs">未完成</span>
                        </div>
                      )}

                      {/* 信息 */}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-800 truncate">{material?.title ?? '未知材料'}</h3>
                        <div className="flex items-center gap-2 text-sm text-gray-500 mt-0.5 flex-wrap">
                          {topic && <span className="px-2 py-0.5 bg-gray-100 rounded text-xs">{topic.name}</span>}
                          {material && (
                            <span className={`px-2 py-0.5 rounded text-xs ${getModeColor(material.interpretationType)}`}>
                              {getModeLabel(material.interpretationType)}
                            </span>
                          )}
                          <span className="text-xs">{formatDate(session.startedAt)}</span>
                          <span className="text-xs">时长 {formatDuration(session.startedAt, session.completedAt)}</span>
                        </div>
                        {/* 分项分数 */}
                        {session.score && (
                          <div className="flex items-center gap-3 mt-1">
                            {[
                              { label: '准确性', val: session.score.accuracy },
                              { label: '完整性', val: session.score.completeness },
                              { label: '流畅度', val: session.score.fluency },
                            ].map(s => (
                              <span key={s.label} className="text-xs text-gray-500">
                                {s.label} <strong className="text-gray-700">{s.val}</strong>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 右侧按钮 */}
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      {session.recordingBlob && (
                        <button
                          onClick={e => { e.stopPropagation(); downloadRecording(session, material); }}
                          className="p-2 hover:bg-blue-50 rounded-lg transition"
                          title="下载录音"
                        >
                          <Download className="w-4 h-4 text-blue-500" />
                        </button>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); handleDelete(session.id); }}
                        className="p-2 hover:bg-red-50 rounded-lg transition"
                        title="删除记录"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                      {isOpen
                        ? <ChevronUp className="w-4 h-4 text-gray-400" />
                        : <ChevronDown className="w-4 h-4 text-gray-400" />
                      }
                    </div>
                  </div>

                  {/* 展开详情 */}
                  {isOpen && (
                    <div className="border-t border-gray-100 p-5 space-y-4 bg-gray-50">

                      {/* 录音回放 */}
                      {session.recordingBlob && (
                        <div className="bg-white rounded-xl border border-gray-200 p-4">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                              <Volume2 className="w-4 h-4 text-indigo-500" /> 录音回放
                            </h4>
                            <button
                              onClick={() => downloadRecording(session, material)}
                              className="flex items-center gap-1 text-xs px-3 py-1 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition"
                            >
                              <Download className="w-3 h-3" /> 下载录音
                            </button>
                          </div>
                          <audio src={session.recordingBlob} controls className="w-full" />
                        </div>
                      )}

                      {/* 三大维度评分 */}
                      {session.score?.details && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700 mb-3">评分详情</h4>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {[
                              { key: 'Content',   icon: <BookOpen className="w-4 h-4" />,  label: '内容', weight: '40%' },
                              { key: 'Delivery',  icon: <Mic2 className="w-4 h-4" />,      label: '表达', weight: '35%' },
                              { key: 'Technique', icon: <Lightbulb className="w-4 h-4" />, label: '技巧', weight: '25%' },
                            ].map(dim => {
                              const detail = session.score!.details.find(d => d.category.includes(dim.key));
                              if (!detail) return null;
                              const color = detail.score >= 80 ? 'bg-green-50 border-green-200' : detail.score >= 65 ? 'bg-blue-50 border-blue-200' : detail.score >= 50 ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200';
                              const textColor = detail.score >= 80 ? 'text-green-600' : detail.score >= 65 ? 'text-blue-600' : detail.score >= 50 ? 'text-yellow-600' : 'text-red-600';
                              const barColor = detail.score >= 80 ? 'bg-green-400' : detail.score >= 65 ? 'bg-blue-400' : detail.score >= 50 ? 'bg-yellow-400' : 'bg-red-400';
                              return (
                                <div key={dim.key} className={`rounded-xl border p-4 ${color}`}>
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                      <div className="p-1 bg-white rounded text-indigo-600">{dim.icon}</div>
                                      <div>
                                        <div className="text-xs font-semibold text-gray-700">{dim.label}</div>
                                        <div className="text-xs text-gray-400">{dim.weight}</div>
                                      </div>
                                    </div>
                                    <span className={`text-xl font-bold ${textColor}`}>{detail.score}</span>
                                  </div>
                                  <div className="h-1.5 bg-white/60 rounded-full overflow-hidden mb-2">
                                    <div className={`h-full ${barColor}`} style={{ width: `${detail.score}%` }} />
                                  </div>
                                  <p className="text-xs text-gray-600 leading-relaxed">{detail.feedback}</p>
                                </div>
                              );
                            })}
                          </div>
                          {/* 综合评价 */}
                          {session.score.details.find(d => d.category.includes('综合')) && (
                            <div className="mt-3 p-3 bg-white rounded-xl border border-gray-200">
                              <p className="text-xs text-gray-500 mb-1">综合评价</p>
                              <p className="text-sm text-gray-700">{session.score.details.find(d => d.category.includes('综合'))?.feedback}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* 转写内容 */}
                      {session.transcription && (
                        <div className="bg-white rounded-xl border border-gray-200 p-4">
                          <h4 className="text-sm font-semibold text-gray-700 mb-2">口译转写（Whisper）</h4>
                          <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{session.transcription}</p>
                        </div>
                      )}

                      {/* 参考译文 */}
                      {material?.referenceTranslation && (
                        <div className="bg-green-50 rounded-xl border border-green-200 p-4">
                          <h4 className="text-sm font-semibold text-green-700 mb-2">参考译文</h4>
                          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{material.referenceTranslation}</p>
                        </div>
                      )}

                      {/* 原文 */}
                      {material?.sourceContent && (
                        <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
                          <h4 className="text-sm font-semibold text-blue-700 mb-2">
                            原文（{material.sourceLanguage === 'en' ? '英文' : '中文'}）
                          </h4>
                          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{material.sourceContent}</p>
                        </div>
                      )}

                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}