import React, { useState, useEffect } from 'react';
import { Plus, Folder, Trash2, Edit2, FileText, AudioLines, Video } from 'lucide-react';
import type { Topic, PracticeMaterial } from '../types';
import * as db from '../lib/db';

interface Props {
  onSelectMaterial: (material: PracticeMaterial) => void;
}

export function TopicManager({ onSelectMaterial }: Props) {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [materials, setMaterials] = useState<PracticeMaterial[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [showTopicForm, setShowTopicForm] = useState(false);
  const [showMaterialForm, setShowMaterialForm] = useState(false);
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null);
  const [topicName, setTopicName] = useState('');
  const [topicDesc, setTopicDesc] = useState('');

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const loadedTopics = await db.getAllTopics();
    const loadedMaterials = await db.getAllMaterials();
    setTopics(loadedTopics);
    setMaterials(loadedMaterials);
  }

  async function handleSaveTopic() {
    if (!topicName.trim()) return;
    const topic: Topic = editingTopic
      ? { ...editingTopic, name: topicName, description: topicDesc, updatedAt: Date.now() }
      : { id: db.generateId(), name: topicName, description: topicDesc, createdAt: Date.now(), updatedAt: Date.now() };
    await db.saveTopic(topic);
    await loadData();
    resetTopicForm();
  }

  async function handleDeleteTopic(topic: Topic) {
    if (!confirm(`确定要删除主题 "${topic.name}" 吗？`)) return;
    const topicMaterials = materials.filter(m => m.topicId === topic.id);
    for (const m of topicMaterials) await db.deleteMaterial(m.id);
    await db.deleteTopic(topic.id);
    if (selectedTopic?.id === topic.id) setSelectedTopic(null);
    await loadData();
  }

  async function handleDeleteMaterial(e: React.MouseEvent, materialId: string) {
    e.stopPropagation();
    if (!confirm('确定要删除这个练习材料吗？')) return;
    await db.deleteMaterial(materialId);
    await loadData();
  }

  function resetTopicForm() {
    setTopicName(''); setTopicDesc(''); setEditingTopic(null); setShowTopicForm(false);
  }

  function startEditTopic(topic: Topic) {
    setEditingTopic(topic); setTopicName(topic.name); setTopicDesc(topic.description); setShowTopicForm(true);
  }

  const topicMaterials = selectedTopic ? materials.filter(m => m.topicId === selectedTopic.id) : [];

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'audio': return <AudioLines className="w-4 h-4" />;
      case 'video': return <Video className="w-4 h-4" />;
      default:      return <FileText className="w-4 h-4" />;
    }
  };

  const getModeLabel = (mode: string) => {
    switch (mode) {
      case 'consecutive':  return '交替传译';
      case 'simultaneous': return '同声传译';
      case 'sight':        return '视译';
      case 'self-paced':   return '自由练习';
      default: return mode;
    }
  };

  const getModeColor = (mode: string) => {
    switch (mode) {
      case 'consecutive':  return 'bg-blue-100 text-blue-700';
      case 'simultaneous': return 'bg-purple-100 text-purple-700';
      case 'sight':        return 'bg-green-100 text-green-700';
      case 'self-paced':   return 'bg-gray-100 text-gray-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getDiffStyle = (diff?: number) => {
    switch (diff) {
      case 2: return { label: '二级', cls: 'bg-yellow-100 text-yellow-700' };
      case 3: return { label: '三级', cls: 'bg-green-100 text-green-700' };
      default: return { label: '一级', cls: 'bg-red-100 text-red-700' };
    }
  };

  const needsDifficulty = (mode: string) =>
    mode === 'consecutive' || mode === 'simultaneous';

  return (
    <div className="flex h-full">

      {/* 左侧主题列表 */}
      <div className="w-72 border-r border-gray-200 bg-gray-50 flex flex-col">
        <div className="p-4 border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold text-gray-800">主题分类</h2>
            <button
              onClick={() => setShowTopicForm(true)}
              className="p-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <p className="text-sm text-gray-500">选择主题开始练习</p>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {topics.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Folder className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>暂无主题</p>
              <p className="text-sm">点击 + 创建新主题</p>
            </div>
          ) : (
            topics.map(topic => (
              <div
                key={topic.id}
                onClick={() => setSelectedTopic(topic)}
                className={`p-3 rounded-lg mb-2 cursor-pointer transition group ${
                  selectedTopic?.id === topic.id
                    ? 'bg-indigo-100 border-2 border-indigo-300'
                    : 'bg-white border border-gray-200 hover:border-indigo-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Folder className={`w-5 h-5 flex-shrink-0 ${
                      selectedTopic?.id === topic.id ? 'text-indigo-600' : 'text-gray-400'
                    }`} />
                    <span className="font-medium truncate">{topic.name}</span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                    <button
                      onClick={(e) => { e.stopPropagation(); startEditTopic(topic); }}
                      className="p-1 hover:bg-gray-200 rounded"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-gray-500" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteTopic(topic); }}
                      className="p-1 hover:bg-red-100 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </button>
                  </div>
                </div>
                {topic.description && (
                  <p className="text-xs text-gray-500 mt-1 truncate pl-7">{topic.description}</p>
                )}
                <div className="text-xs text-gray-400 mt-1 pl-7">
                  {materials.filter(m => m.topicId === topic.id).length} 个练习材料
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 右侧材料列表 */}
      <div className="flex-1 flex flex-col bg-white">
        {selectedTopic ? (
          <>
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-gray-800">{selectedTopic.name}</h2>
                  <p className="text-sm text-gray-500">{selectedTopic.description}</p>
                </div>
                <button
                  onClick={() => setShowMaterialForm(true)}
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" /> 导入材料
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {topicMaterials.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <FileText className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg">暂无练习材料</p>
                  <p>点击「导入材料」添加音频、视频或文本</p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {topicMaterials.map(mat => {
                    const diff = getDiffStyle(mat.difficulty);
                    const showDiff = needsDifficulty(mat.interpretationType);
                    return (
                      <div
                        key={mat.id}
                        onClick={() => onSelectMaterial(mat)}
                        className="p-4 border border-gray-200 rounded-xl hover:border-indigo-300 hover:shadow-md cursor-pointer transition group"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className={`p-2 rounded-lg flex-shrink-0 ${
                              mat.type === 'audio' ? 'bg-purple-100 text-purple-600' :
                              mat.type === 'video' ? 'bg-red-100 text-red-600' :
                              'bg-blue-100 text-blue-600'
                            }`}>
                              {getTypeIcon(mat.type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-medium text-gray-800 truncate">{mat.title}</h3>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${getModeColor(mat.interpretationType)}`}>
                                  {getModeLabel(mat.interpretationType)}
                                </span>
                                {showDiff && (
                                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${diff.cls}`}>
                                    {diff.label}难度
                                  </span>
                                )}
                                <span className="text-xs text-gray-400">
                                  {mat.sourceLanguage === 'en' ? '英→中' : '中→英'}
                                </span>
                                {mat.referenceTranslation && (
                                  <span className="text-xs text-green-600">含参考译文</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={(e) => handleDeleteMaterial(e, mat.id)}
                            className="ml-2 p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-100 rounded transition flex-shrink-0"
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <Folder className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg">请先选择左侧主题</p>
            </div>
          </div>
        )}
      </div>

      {/* 新增/编辑主题弹窗 */}
      {showTopicForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-xl font-semibold mb-4">
              {editingTopic ? '编辑主题' : '新建主题'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">主题名称</label>
                <input
                  type="text"
                  value={topicName}
                  onChange={(e) => setTopicName(e.target.value)}
                  placeholder="如：国际时事、经济金融..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">描述（可选）</label>
                <textarea
                  value={topicDesc}
                  onChange={(e) => setTopicDesc(e.target.value)}
                  placeholder="简单描述这个主题..."
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={resetTopicForm} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                取消
              </button>
              <button onClick={handleSaveTopic} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                {editingTopic ? '保存' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 材料导入弹窗 */}
      {showMaterialForm && selectedTopic && (
        <MaterialImportModal
          topicId={selectedTopic.id}
          onClose={() => setShowMaterialForm(false)}
          onSave={async () => { await loadData(); setShowMaterialForm(false); }}
        />
      )}
    </div>
  );
}

function MaterialImportModal({
  topicId, onClose, onSave
}: {
  topicId: string;
  onClose: () => void;
  onSave: () => void;
}) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'text' | 'audio' | 'video'>('audio');
  const [interpretationType, setInterpretationType] = useState<'consecutive' | 'simultaneous' | 'sight' | 'self-paced'>('consecutive');
  const [sourceLanguage, setSourceLanguage] = useState<'en' | 'zh'>('en');
  const [difficulty, setDifficulty] = useState<1 | 2 | 3>(1);
  const [sourceContent, setSourceContent] = useState('');
  const [referenceTranslation, setReferenceTranslation] = useState('');
  const [mediaFile, setMediaFile] = useState<File | null>(null);

  const showDifficulty = interpretationType === 'consecutive' || interpretationType === 'simultaneous';

  async function handleSave() {
    if (!title.trim()) { alert('请填写材料标题'); return; }
    if ((type === 'audio' || type === 'video') && !mediaFile) {
      alert(`请上传${type === 'audio' ? '音频' : '视频'}文件`); return;
    }
    if (type === 'text' && !sourceContent.trim()) {
      alert('纯文本模式请填写原文内容'); return;
    }

    let mediaBlob: string | undefined;
    if (mediaFile) {
      mediaBlob = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(mediaFile);
      });
    }

    const material: PracticeMaterial = {
      id: db.generateId(),
      topicId,
      title,
      type,
      sourceLanguage,
      targetLanguage: sourceLanguage === 'en' ? 'zh' : 'en',
      interpretationType,
      difficulty: showDifficulty ? difficulty : undefined,
      sourceContent: sourceContent.trim() || undefined,
      referenceTranslation: referenceTranslation.trim() || undefined,
      mediaBlob,
      createdAt: Date.now(),
    };

    await db.saveMaterial(material);
    onSave();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-2xl my-8">
        <h3 className="text-xl font-semibold mb-4">导入练习材料</h3>

        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">材料标题</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="如：联合国气候峰会发言"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">材料类型</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as any)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              >
                <option value="audio">音频</option>
                <option value="video">视频</option>
                <option value="text">纯文本</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">口译模式</label>
              <select
                value={interpretationType}
                onChange={(e) => setInterpretationType(e.target.value as any)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              >
                <option value="consecutive">交替传译</option>
                <option value="simultaneous">同声传译</option>
                <option value="sight">视译</option>
                <option value="self-paced">自由练习（音频自带提示音）</option>
              </select>
            </div>
          </div>

          {interpretationType === 'self-paced' && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <p className="text-sm text-gray-600">
                <strong>自由练习模式：</strong>系统不自动暂停，由学员根据音频节奏手动控制录音。适合已内置停顿提示音的练习音频。
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">源语言</label>
              <select
                value={sourceLanguage}
                onChange={(e) => setSourceLanguage(e.target.value as any)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              >
                <option value="en">英语</option>
                <option value="zh">中文</option>
              </select>
            </div>
            {showDifficulty && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">难度等级</label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(Number(e.target.value) as 1 | 2 | 3)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                >
                  <option value={1}>一级（每 45~65 秒暂停）</option>
                  <option value={2}>二级（每 30~50 秒暂停）</option>
                  <option value={3}>三级（每 15~30 秒暂停）</option>
                </select>
              </div>
            )}
          </div>

          {(type === 'audio' || type === 'video') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                上传{type === 'audio' ? '音频' : '视频'}文件
              </label>
              <input
                type="file"
                accept={type === 'audio' ? 'audio/*' : 'video/*'}
                onChange={(e) => setMediaFile(e.target.files?.[0] || null)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              原文内容（{sourceLanguage === 'en' ? '英文' : '中文'}）
              {type !== 'text' && (
                <span className="ml-1 text-xs text-gray-400 font-normal">选填</span>
              )}
            </label>
            <textarea
              value={sourceContent}
              onChange={(e) => setSourceContent(e.target.value)}
              placeholder={type === 'text' ? '输入原文内容（必填）...' : '可选填，用于视译或对照练习...'}
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              参考译文（{sourceLanguage === 'en' ? '中文' : '英文'}）
              <span className="ml-1 text-xs text-gray-400 font-normal">选填，有则参与评分</span>
            </label>
            <textarea
              value={referenceTranslation}
              onChange={(e) => setReferenceTranslation(e.target.value)}
              placeholder="可选填参考译文，填写后将用于评分对比..."
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>

        </div>

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
            取消
          </button>
          <button onClick={handleSave} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
            导入
          </button>
        </div>
      </div>
    </div>
  );
}