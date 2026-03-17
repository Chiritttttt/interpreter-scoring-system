import React, { useState } from 'react';
import { Languages } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Props {
  onSuccess: () => void;
}

export function AuthPage({ onSuccess }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function handleSubmit() {
    if (!email || !password) { setError('请填写邮箱和密码'); return; }
    if (mode === 'register' && password.length < 6) { setError('密码至少 6 位'); return; }
    setLoading(true); setError(''); setMessage('');
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onSuccess();
      } else {
        const { error } = await supabase.auth.signUp({
          email, password, options: { data: { name } },
        });
        if (error) throw error;
        setMessage('注册成功！请查收验证邮件后登录。');
        setMode('login');
      }
    } catch (e: any) {
      setError(
        e.message === 'Invalid login credentials' ? '邮箱或密码错误' :
        e.message === 'User already registered' ? '该邮箱已注册' :
        e.message
      );
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-100 rounded-2xl mb-4">
            <Languages className="w-8 h-8 text-indigo-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">口译练习系统</h1>
          <p className="text-gray-500 text-sm mt-1">Interpreter Training</p>
        </div>

        <div className="flex bg-gray-100 rounded-xl p-1 mb-6">
          <button
            onClick={() => { setMode('login'); setError(''); }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${mode === 'login' ? 'bg-white text-indigo-600 shadow' : 'text-gray-500'}`}
          >登录</button>
          <button
            onClick={() => { setMode('register'); setError(''); }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${mode === 'register' ? 'bg-white text-indigo-600 shadow' : 'text-gray-500'}`}
          >注册</button>
        </div>

        <div className="space-y-4">
          {mode === 'register' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">姓名</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="请输入姓名"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500" />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">邮箱</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="请输入邮箱"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">密码</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder={mode === 'register' ? '至少 6 位' : '请输入密码'}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500" />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
          {message && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3">
              <p className="text-sm text-green-600">{message}</p>
            </div>
          )}

          <button onClick={handleSubmit} disabled={loading}
            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition disabled:opacity-50">
            {loading ? '处理中…' : mode === 'login' ? '登录' : '注册'}
          </button>
        </div>
      </div>
    </div>
  );
}