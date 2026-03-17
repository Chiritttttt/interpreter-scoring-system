import { supabase, signOut } from './lib/supabase';
import { AuthPage } from './components/AuthPage';
import React, { useState, useEffect } from 'react';
import { Languages, BookOpen, History, Settings, Mic, Menu, Download, Upload, Trash2, HardDrive } from 'lucide-react';
import type { PracticeMaterial } from './types';
import { TopicManager } from './components/TopicManager';
import { PracticeSession } from './components/PracticeSession';
import { HistoryView } from './components/HistoryView';
import { initDB, getAllSessions, getAllMaterials, getAllTopics, saveTopic, saveMaterial, saveSession } from './lib/dbCloud.ts';
import { Languages, BookOpen, History, Settings, Mic, Menu, Download, Upload, Trash2, HardDrive, LogOut } from 'lucide-react';
type View = 'topics' | 'practice' | 'history' | 'settings';

function App() {
  const [currentView, setCurrentView] = useState<View>('topics');
  const [selectedMaterial, setSelectedMaterial] = useState<PracticeMaterial | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);


  useEffect(() => {
  // 检查登录状态
  supabase.auth.getSession().then(({ data: { session } }) => {
    setUser(session?.user ?? null);
    setAuthLoading(false);
  });

  // 监听登录状态变化
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    setUser(session?.user ?? null);
  });

  return () => subscription.unsubscribe();
}, []);

  useEffect(() => {
  initDB().then(() => setIsLoading(false));
}, []);

  const handleSelectMaterial = (material: PracticeMaterial) => {
    setSelectedMaterial(material);
    setCurrentView('practice');
  };

  const handleBackFromPractice = () => {
    setSelectedMaterial(null);
    setCurrentView('topics');
  };

  if (authLoading) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
      <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-white" />
    </div>
  );
}

if (!user) {
  return <AuthPage onSuccess={() => {}} />;
}

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
        <div className="text-center text-white">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-white mx-auto mb-4" />
          <p className="text-xl">加载中...</p>
        </div>
      </div>
    );
  }

  const navItems = [
    { id: 'topics'   as View, icon: BookOpen, label: '主题管理' },
    { id: 'history'  as View, icon: History,  label: '练习历史' },
    { id: 'settings' as View, icon: Settings, label: '设置'     },
  ];

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {mobileMenuOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setMobileMenuOpen(false)} />
      )}

      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-gradient-to-b from-indigo-600 to-indigo-800 text-white flex flex-col transform transition-transform duration-300 ${
        mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}>
        <div className="p-6 border-b border-indigo-500">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-xl">
              <Languages className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-xl font-bold">口译练习系统</h1>
              <p className="text-xs text-indigo-200">Interpreter Training</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            {navItems.map(item => (
              <li key={item.id}>
                <button
                  onClick={() => { setCurrentView(item.id); setSelectedMaterial(null); setMobileMenuOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition ${
                    currentView === item.id && !selectedMaterial
                      ? 'bg-white/20 text-white'
                      : 'text-indigo-200 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="font-medium">{item.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="p-4 border-t border-indigo-500">
          <div className="flex items-center gap-3 px-4 py-3 bg-white/10 rounded-xl">
            <div className="p-2 bg-green-500 rounded-lg">
              <Mic className="w-4 h-4" />
            </div>
            <div className="text-sm">
              <div className="font-medium">AI 评分已启用</div>
              <button
  onClick={async () => {
    await signOut();
    setUser(null);
  }}
  className="w-full mt-2 flex items-center gap-3 px-4 py-3 bg-white/10 rounded-xl text-indigo-200 hover:bg-white/20 transition text-sm"
>
  <LogOut className="w-4 h-4" />
  <span>退出登录</span>
</button>
              <div className="text-indigo-200 text-xs">语音识别就绪</div>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-h-screen">
        <header className="lg:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <button onClick={() => setMobileMenuOpen(true)} className="p-2 hover:bg-gray-100 rounded-lg">
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2">
            <Languages className="w-6 h-6 text-indigo-600" />
            <span className="font-semibold text-gray-800">口译练习系统</span>
          </div>
          <div className="w-10" />
        </header>

        <div className="flex-1 overflow-hidden">
          {currentView === 'practice' && selectedMaterial ? (
            <PracticeSession material={selectedMaterial} onBack={handleBackFromPractice} />
          ) : currentView === 'history' ? (
            <HistoryView />
          ) : currentView === 'settings' ? (
            <SettingsView />
          ) : (
            <TopicManager onSelectMaterial={handleSelectMaterial} />
          )}
        </div>
      </main>
    </div>
  );
}

// ── 精简后的设置页面 ──────────────────────────────────────────
function SettingsView() {
  const [exportLoading, setExportLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [storageInfo, setStorageInfo] = useState<{
    sessions: number; materials: number; topics: number; estimatedMB: string;
  } | null>(null);

  useEffect(() => { loadStorageInfo(); }, []);

  async function loadStorageInfo() {
  const [sessions, materials, topics] = await Promise.all([
    getAllSessions(), getAllMaterials(), getAllTopics()
  ]);
  // 估算大小：只看 recordingBlob 和 mediaBlob 的字符串长度，不做完整序列化
  let totalBytes = 0;
  for (const s of sessions) {
    if (s.recordingBlob) totalBytes += s.recordingBlob.length;
  }
  for (const m of materials) {
    if (m.mediaBlob) totalBytes += m.mediaBlob.length;
  }
  setStorageInfo({
    sessions: sessions.length,
    materials: materials.length,
    topics: topics.length,
    estimatedMB: (totalBytes / 1024 / 1024).toFixed(1),
  });
}

  // 导出（不含音视频）
  async function handleExport() {
    setExportLoading(true);
    try {
      const [sessions, materials, topics] = await Promise.all([
        getAllSessions(), getAllMaterials(), getAllTopics()
      ]);
      const data = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        topics,
        materials: materials.map(m => ({
          ...m, mediaBlob: m.mediaBlob ? '[已省略]' : undefined,
        })),
        sessions: sessions.map(s => ({
          ...s, recordingBlob: s.recordingBlob ? '[已省略]' : undefined,
        })),
      };
      download(JSON.stringify(data, null, 2), `口译练习备份_${today()}.json`, 'application/json');
    } catch (e) { alert('导出失败：' + e); }
    finally { setExportLoading(false); }
  }

  // 完整导出（含录音，文件较大）
  async function handleExportFull() {
  if (!confirm('完整备份包含所有录音文件，数据量可能较大，导出时请勿操作页面，确定继续吗？')) return;
  setExportLoading(true);
  try {
    const [sessions, materials, topics] = await Promise.all([
      getAllSessions(), getAllMaterials(), getAllTopics()
    ]);
    // 分批构建，避免一次性 stringify 大对象
    const chunks: string[] = [];
    chunks.push(`{"version":"1.0-full","exportedAt":"${new Date().toISOString()}",`);
    chunks.push(`"topics":${JSON.stringify(topics)},`);
    chunks.push(`"materials":${JSON.stringify(materials)},`);
    chunks.push('"sessions":[');
    for (let i = 0; i < sessions.length; i++) {
      chunks.push(JSON.stringify(sessions[i]));
      if (i < sessions.length - 1) chunks.push(',');
    }
    chunks.push(']}');
    const blob = new Blob(chunks, { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `口译练习完整备份_${today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) { alert('导出失败：' + e); }
  finally { setExportLoading(false); }
}

  // 导入
  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm('导入将合并到现有数据（不覆盖同名），确定继续吗？')) return;
    setImportLoading(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      let count = 0;
      for (const t of data.topics   ?? []) { await saveTopic(t);   count++; }
      for (const m of data.materials ?? []) {
        if (m.mediaBlob === '[已省略]') m.mediaBlob = undefined;
        await saveMaterial(m); count++;
      }
      for (const s of data.sessions  ?? []) {
        if (s.recordingBlob === '[已省略]') s.recordingBlob = undefined;
        await saveSession(s); count++;
      }
      await loadStorageInfo();
      alert(`导入成功，共 ${count} 条记录`);
    } catch (e) { alert('导入失败，请检查文件格式：' + e); }
    finally { setImportLoading(false); e.target.value = ''; }
  }

  async function handleClearData() {
    if (!confirm('确定要清除所有数据吗？此操作不可撤销！')) return;
    if (!confirm('再次确认：将删除所有主题、材料和练习记录，是否继续？')) return;
    const dbs = await indexedDB.databases();
    for (const d of dbs) { if (d.name) indexedDB.deleteDatabase(d.name); }
    window.location.reload();
  }

  function download(content: string, filename: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function today() {
    return new Date().toLocaleDateString('zh-CN').replace(/\//g, '-');
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-6">
      <div className="max-w-xl mx-auto space-y-6">
        <h2 className="text-2xl font-bold text-gray-800">设置</h2>

        {/* 存储信息 */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-indigo-500" /> 数据存储
          </h3>

          {storageInfo && (
            <div className="grid grid-cols-4 gap-3 mb-5">
              {[
                { label: '主题',     value: storageInfo.topics    },
                { label: '练习材料', value: storageInfo.materials },
                { label: '练习记录', value: storageInfo.sessions  },
                { label: '占用估算', value: `${storageInfo.estimatedMB}MB` },
              ].map(item => (
                <div key={item.label} className="bg-gray-50 rounded-lg p-3 text-center">
                  <div className="text-lg font-bold text-gray-800">{item.value}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{item.label}</div>
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-gray-400 mb-4">
            数据保存在浏览器 IndexedDB 中，仅存于本机。可通过导出备份到任意位置，导入时合并恢复。
          </p>

          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <div className="text-sm font-medium text-gray-700">导出备份</div>
                <div className="text-xs text-gray-400">不含音视频文件，文件小</div>
              </div>
              <button
                onClick={handleExport}
                disabled={exportLoading}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-sm disabled:opacity-50"
              >
                <Download className="w-4 h-4" /> {exportLoading ? '导出中…' : '导出'}
              </button>
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <div className="text-sm font-medium text-gray-700">完整备份</div>
                <div className="text-xs text-gray-400">含录音文件，文件较大</div>
              </div>
              <button
                onClick={handleExportFull}
                disabled={exportLoading}
                className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm disabled:opacity-50"
              >
                <Download className="w-4 h-4" /> {exportLoading ? '导出中…' : '完整导出'}
              </button>
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <div className="text-sm font-medium text-gray-700">导入备份</div>
                <div className="text-xs text-gray-400">从 JSON 文件恢复，合并不覆盖</div>
              </div>
              <label className={`flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm cursor-pointer ${importLoading ? 'opacity-50 pointer-events-none' : ''}`}>
                <Upload className="w-4 h-4" /> {importLoading ? '导入中…' : '导入'}
                <input type="file" accept=".json" onChange={handleImport} className="hidden" />
              </label>
            </div>
          </div>
        </div>

        {/* 清除数据 */}
        <div className="bg-white rounded-xl border border-red-200 p-6">
          <h3 className="text-base font-semibold text-red-600 mb-3 flex items-center gap-2">
            <Trash2 className="w-5 h-5" /> 危险操作
          </h3>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-gray-800">清除所有数据</div>
              <div className="text-xs text-gray-500">删除所有主题、材料和练习记录，不可撤销</div>
            </div>
            <button onClick={handleClearData} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-sm">
              清除数据
            </button>
          </div>
        </div>

        {/* 关于 */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-base font-semibold text-gray-800 mb-3">关于</h3>
          <div className="text-sm text-gray-500 space-y-1">
            <p><strong className="text-gray-700">口译练习评分系统</strong> v2.0</p>
            <p>支持交替传译 · 同声传译 · 视译 · 自由练习</p>
            <p>Whisper 本地转录 · DeepSeek AI 评分</p>
            <p>基于 AIIC 评分标准（内容 / 表达 / 技巧）</p>
          </div>
        </div>

      </div>
    </div>
  );
}

export default App;