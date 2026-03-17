import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Play, Mic, Square, RefreshCw,
  Volume2, Eye, EyeOff, Clock, AlertCircle, SendHorizonal
} from 'lucide-react';
import type { PracticeMaterial, PracticeSession as Session, ScoreResult } from '../types';
import { AudioRecorder, blobToBase64 } from '../lib/recorder';
import { SpeechRecognizer, TextToSpeech, whisperTranscribe } from '../lib/speech';
import { calculateScore, buildScoreFromAI } from '../lib/scoring';
import * as db from '../lib/dbCloud.ts';
import { ScoreDisplay } from './ScoreDisplay';
import { AutoPauseController } from '../lib/autoPause';
import {
  transcribeAudio,
  generateReferenceTranslation,
  aiScoreInterpretation,
  getDeepSeekKey,
  setDeepSeekKey,
} from '../lib/translate';

interface Props {
  material: PracticeMaterial;
  onBack: () => void;
}

type PracticeState = 'ready' | 'playing' | 'auto-paused' | 'recording' | 'completed';

const RESUME_DELAY_MS = 120_000;

const DIFFICULTY_CONFIG: Record<1 | 2 | 3, { min: number; max: number }> = {
  1: { min: 45, max: 65 },
  2: { min: 30, max: 50 },
  3: { min: 15, max: 30 },
};

function getBlobDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio();
    const url = URL.createObjectURL(blob);
    audio.src = url;
    audio.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(audio.duration || 0); };
    audio.onerror = () => { URL.revokeObjectURL(url); resolve(0); };
  });
}

export function PracticeSession({ material, onBack }: Props) {
  const [state, setState] = useState<PracticeState>('ready');
  const [transcription, setTranscription] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [showReference, setShowReference] = useState(false);
  const [showSource, setShowSource] = useState(material.interpretationType === 'sight');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [whisperLoading, setWhisperLoading] = useState(false);
  const [whisperStep, setWhisperStep] = useState('');
  const [generatedReference, setGeneratedReference] = useState('');
  const [segmentCount, setSegmentCount] = useState(0);

  const countdownRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const resumeAtRef       = useRef<number>(0);
  const recorderRef       = useRef<AudioRecorder | null>(null);
  const recognizerRef     = useRef<SpeechRecognizer | null>(null);
  const ttsRef            = useRef<TextToSpeech | null>(null);
  const mediaAudioRef     = useRef<HTMLAudioElement | null>(null);
  const mediaVideoRef     = useRef<HTMLVideoElement | null>(null);
  const autoPauseRef      = useRef<AutoPauseController | null>(null);
  const stateRef          = useRef(state);
  stateRef.current = state;
  const transcriptionRef  = useRef(transcription);
  transcriptionRef.current = transcription;
  const savedTranscriptionRef = useRef('');
  const audioBlobsRef     = useRef<Blob[]>([]);
  const mergedBlobRef     = useRef<Blob | null>(null);
  const audioUrlRef       = useRef<string | null>(null);
  const whisperLoadingRef = useRef(false);
  whisperLoadingRef.current = whisperLoading;

  useEffect(() => {
    recorderRef.current   = new AudioRecorder();
    recognizerRef.current = new SpeechRecognizer(
      material.targetLanguage === 'zh' ? 'zh-CN' : 'en-US'
    );
    ttsRef.current = new TextToSpeech();

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (whisperLoadingRef.current) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      autoPauseRef.current?.destroy();
      stopCountdown();
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    };
  }, []);

  const startCountdown = () => {
    stopCountdown();
    resumeAtRef.current = Date.now() + RESUME_DELAY_MS;
    countdownRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((resumeAtRef.current - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining <= 0) stopCountdown();
    }, 500);
  };

  const stopCountdown = () => {
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
  };

  const handleAutoPause = useCallback(async () => {
    setState('auto-paused');
    startCountdown();
    try {
      await recorderRef.current?.start();
      recognizerRef.current?.start(
        (text) => setTranscription(text),
        (err) => console.error('语音识别错误:', err)
      );
    } catch { alert('无法启动录音，请确保已授予麦克风权限'); }
  }, []);

  const handleAutoResume = useCallback(async () => {
    stopCountdown();
    setCountdown(0);
    await _stopAndSaveRecording();
    setState('playing');
  }, []);

  const _stopAndSaveRecording = async () => {
    try {
      const audioBlob = await recorderRef.current?.stop();
      const seg = recognizerRef.current?.stop() || transcriptionRef.current;
      if (seg?.trim()) {
        savedTranscriptionRef.current = savedTranscriptionRef.current
          ? savedTranscriptionRef.current + ' ' + seg.trim()
          : seg.trim();
      }
      setTranscription('');

      if (audioBlob && audioBlob.size > 0) {
        audioBlobsRef.current.push(audioBlob);
        const count = audioBlobsRef.current.length;
        setSegmentCount(count);

        // 合并所有片段
        const merged = new Blob(audioBlobsRef.current, { type: audioBlob.type });
        mergedBlobRef.current = merged;

        // 更新播放 URL
        if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
        const url = URL.createObjectURL(merged);
        audioUrlRef.current = url;
        setAudioUrl(url);

        // base64 存 session
        const recordingBlob = await blobToBase64(merged);
        setSession(prev => prev ? {
          ...prev,
          recordingBlob,
          transcription: savedTranscriptionRef.current,
        } : prev);

        console.log(`片段 ${count} 已合并，大小: ${(merged.size / 1024).toFixed(0)}KB`);
      }
    } catch (e) {
      console.error('保存录音片段失败:', e);
    }
  };

  const startRecording = async () => {
    try {
      await recorderRef.current?.start();
      setState('recording');
      recognizerRef.current?.start(
        (text) => setTranscription(text),
        (err) => console.error('语音识别错误:', err)
      );
    } catch { alert('无法启动录音，请确保已授予麦克风权限'); }
  };

  const stopRecording = async () => {
    await _stopAndSaveRecording();
    const mediaEl = material.type === 'audio' ? mediaAudioRef.current : mediaVideoRef.current;
    if (mediaEl && mediaEl.paused) mediaEl.play().catch(() => {});
    autoPauseRef.current?.resumeEarly();
    setState('playing');
  };

  const submitScore = async () => {
    if (!session) return;
    if (stateRef.current === 'recording' || stateRef.current === 'auto-paused') {
      await _stopAndSaveRecording();
    }

    setState('completed');
    setWhisperLoading(true);

    let finalTranscription = savedTranscriptionRef.current || session.transcription || '';
    let finalReference     = material.referenceTranslation ?? '';
    let sourceTextForAI    = material.sourceContent ?? '';
    let userDurationSec    = 0;
    let sourceDurationSec  = 0;

    try {
      // 获取时长
      if (mergedBlobRef.current) {
        userDurationSec = await getBlobDuration(mergedBlobRef.current);
      }
      if (mediaAudioRef.current?.duration && isFinite(mediaAudioRef.current.duration)) {
        sourceDurationSec = mediaAudioRef.current.duration;
      } else if (mediaVideoRef.current?.duration && isFinite(mediaVideoRef.current.duration)) {
        sourceDurationSec = mediaVideoRef.current.duration;
      }

      // 第一步：Whisper 精确转录
      if (mergedBlobRef.current) {
        setWhisperStep('whisper-recording');
        const whisperText = await whisperTranscribe(mergedBlobRef.current, material.targetLanguage);
        if (whisperText) finalTranscription = whisperText;
      }

      // 第二步：生成参考译文
      if (!finalReference) {
        if (!getDeepSeekKey()) {
          const key = prompt('请输入 DeepSeek API Key：');
          if (key) setDeepSeekKey(key);
        }
        if (getDeepSeekKey()) {
          if (!sourceTextForAI && material.mediaBlob) {
            setWhisperStep('whisper-source');
            try {
              const res  = await fetch(material.mediaBlob);
              const blob = await res.blob();
              const file = new File([blob], 'source.webm', { type: blob.type });
              sourceTextForAI = await transcribeAudio(file, material.sourceLanguage);
            } catch (e) { console.error('原文转录失败:', e); }
          }
          if (sourceTextForAI) {
            setWhisperStep('deepseek');
            try {
              finalReference = await generateReferenceTranslation(
                sourceTextForAI, material.sourceLanguage, material.interpretationType
              );
              setGeneratedReference(finalReference);
              await db.saveMaterial({
                ...material,
                sourceContent: material.sourceContent || sourceTextForAI,
                referenceTranslation: finalReference,
              });
            } catch (e) { console.error('参考译文生成失败:', e); }
          }
        }
      }

      // 第三步：评分
      setWhisperStep('scoring');
      let score: ScoreResult;
      if (getDeepSeekKey()) {
        try {
          const aiResult = await aiScoreInterpretation(
            finalTranscription, finalReference, sourceTextForAI,
            material.interpretationType, material.sourceLanguage,
            userDurationSec, sourceDurationSec
          );
          score = aiResult
            ? buildScoreFromAI(aiResult)
            : calculateScore(finalTranscription, finalReference, userDurationSec, sourceDurationSec);
        } catch {
          score = calculateScore(finalTranscription, finalReference, userDurationSec, sourceDurationSec);
        }
      } else {
        score = calculateScore(finalTranscription, finalReference, userDurationSec, sourceDurationSec);
      }

      const completed: Session = {
        ...session, completedAt: Date.now(),
        transcription: finalTranscription, score,
      };
      await db.saveSession(completed);
      setSession(completed);

    } catch (e) {
      console.error('提交评分失败:', e);
      const score = calculateScore(finalTranscription, finalReference, userDurationSec, sourceDurationSec);
      const completed: Session = { ...session, completedAt: Date.now(), transcription: finalTranscription, score };
      await db.saveSession(completed);
      setSession(completed);
    } finally {
      setWhisperLoading(false);
      setWhisperStep('');
    }
  };

  const handleStart = async () => {
    audioBlobsRef.current = [];
    mergedBlobRef.current = null;
    if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current); audioUrlRef.current = null; }
    setAudioUrl(null);
    setSegmentCount(0);
    savedTranscriptionRef.current = '';
    setGeneratedReference('');

    const newSession: Session = {
      id: db.generateId(), materialId: material.id,
      topicId: material.topicId, startedAt: Date.now(),
    };
    setSession(newSession);

    if (material.interpretationType === 'sight') { setShowSource(true); setState('ready'); return; }

    if (material.type === 'text') {
      setState('playing');
      ttsRef.current?.speak(
        material.sourceContent ?? '',
        material.sourceLanguage === 'en' ? 'en-US' : 'zh-CN',
        () => { if (material.interpretationType === 'consecutive') setState('ready'); }
      );
      if (material.interpretationType === 'simultaneous') await startRecording();
      return;
    }

    setState('playing');
    const mediaEl = material.type === 'audio' ? mediaAudioRef.current : mediaVideoRef.current;
    if (mediaEl && material.mediaBlob) {
      mediaEl.src = material.mediaUrl || material.mediaBlob || '';
      await mediaEl.play();

      if (material.interpretationType === 'consecutive' || material.interpretationType === 'simultaneous') {
        const audioEl = material.type === 'audio'
          ? (mediaAudioRef.current as HTMLAudioElement)
          : (mediaVideoRef.current as unknown as HTMLAudioElement);
        const diff = (material.difficulty ?? 1) as 1 | 2 | 3;
        const { min, max } = DIFFICULTY_CONFIG[diff];
        autoPauseRef.current = new AutoPauseController(audioEl, {
          minTriggerTime: min, maxTriggerTime: max,
          intervalMin: min, intervalMax: max,
          resumeDelay: RESUME_DELAY_MS,
          silenceThreshold: 15, silenceDuration: 600,
          onPause: handleAutoPause, onResume: handleAutoResume,
        });
        autoPauseRef.current.start();
      }
      if (material.interpretationType === 'simultaneous') await startRecording();
    }
  };

  const handleMediaEnded = async () => {
    autoPauseRef.current?.destroy();
    stopCountdown();
    if (stateRef.current === 'recording' || stateRef.current === 'auto-paused') {
      await _stopAndSaveRecording();
    }
    setState('playing');
  };

  const handleReset = () => {
    autoPauseRef.current?.reset();
    stopCountdown();
    setCountdown(0);
    setState('ready');
    setTranscription('');
    savedTranscriptionRef.current = '';
    audioBlobsRef.current = [];
    mergedBlobRef.current = null;
    if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current); audioUrlRef.current = null; }
    setAudioUrl(null);
    setSegmentCount(0);
    setSession(null);
    setShowReference(false);
    setWhisperLoading(false);
    setWhisperStep('');
    setGeneratedReference('');
    setShowSource(material.interpretationType === 'sight');
  };

  const getDiffLabel = () => ({ 2: '二级', 3: '三级' }[material.difficulty ?? 1] ?? '一级');

  const getModeDescription = () => {
    const diff = (material.difficulty ?? 1) as 1 | 2 | 3;
    const { min, max } = DIFFICULTY_CONFIG[diff];
    switch (material.interpretationType) {
      case 'consecutive':  return `音频将每隔约 ${min}~${max} 秒在停顿处自动暂停并开始录音，2 分钟后恢复；可手动停止录音继续听，完成后点「提交评分」`;
      case 'simultaneous': return '边听原文边同步口译录音，完成后点「提交评分」';
      case 'sight':        return '阅读文本后进行口译录音，完成后点「提交评分」';
      case 'self-paced':   return '音频自带暂停和提示音，系统不自动暂停；请根据音频节奏自行点击「开始录音」和「停止录音」，完成后点「提交评分」';
    }
  };

  const formatCountdown = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const canSubmit = !!audioUrl && state !== 'completed';
  const isSelfPaced = material.interpretationType === 'self-paced';
  const needsDifficulty = material.interpretationType === 'consecutive' || material.interpretationType === 'simultaneous';
  const displayReference = material.referenceTranslation || generatedReference;

  const modeStyle: Record<string, string> = {
    consecutive: 'bg-blue-100 text-blue-700', simultaneous: 'bg-purple-100 text-purple-700',
    sight: 'bg-green-100 text-green-700', 'self-paced': 'bg-gray-100 text-gray-700',
  };
  const modeLabel: Record<string, string> = {
    consecutive: '交替传译', simultaneous: '同声传译', sight: '视译', 'self-paced': '自由练习',
  };
  const diffStyle: Record<number, string> = {
    1: 'bg-red-100 text-red-700', 2: 'bg-yellow-100 text-yellow-700', 3: 'bg-green-100 text-green-700',
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">

      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                if (whisperLoading) { if (!confirm('评分正在生成中，退出后结果将丢失，确定退出吗？')) return; }
                onBack();
              }}
              className="p-2 hover:bg-gray-100 rounded-lg transition"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-semibold text-gray-800">{material.title}</h1>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span className={`px-2 py-0.5 rounded text-xs ${modeStyle[material.interpretationType] ?? 'bg-gray-100 text-gray-700'}`}>
                  {modeLabel[material.interpretationType] ?? material.interpretationType}
                </span>
                {needsDifficulty && (
                  <span className={`px-2 py-0.5 rounded text-xs ${diffStyle[material.difficulty ?? 1]}`}>
                    {getDiffLabel()}难度
                  </span>
                )}
                <span>{material.sourceLanguage === 'en' ? '英语 → 中文' : '中文 → 英语'}</span>
              </div>
              {whisperLoading && (
                <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-lg mt-1">
                  <span className="w-2.5 h-2.5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                  评分生成中，请勿退出
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canSubmit && (
              <button onClick={submitScore} className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium shadow">
                <SendHorizonal className="w-4 h-4" /> 提交评分
              </button>
            )}
            {state === 'completed' && !whisperLoading && (
              <button onClick={handleReset} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition">
                <RefreshCw className="w-4 h-4" /> 重新练习
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {state === 'completed' && session?.score ? (
          <ScoreDisplay
            score={session.score}
            transcription={session.transcription || ''}
            reference={displayReference}
            audioUrl={audioUrl}
            whisperLoading={whisperLoading}
            whisperStep={whisperStep}
          />
        ) : (
          <div className="max-w-4xl mx-auto space-y-6">

            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
              <p className="text-indigo-700 text-sm"><strong>练习模式：</strong>{getModeDescription()}</p>
            </div>

            {state === 'auto-paused' && (
              <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="w-6 h-6 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-amber-800">🔔 已自动暂停，录音中…</p>
                  <p className="text-sm text-amber-600 mt-0.5">2 分钟后自动恢复播放 · 口译完成后可点「停止录音」继续收听</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-3xl font-mono font-semibold text-amber-700 tabular-nums">{formatCountdown(countdown)}</div>
                  <div className="flex items-center gap-1 text-xs text-amber-500 mt-1 justify-end">
                    <Clock className="w-3 h-3" /> 剩余口译时间
                  </div>
                </div>
              </div>
            )}

            {audioUrl && state === 'playing' && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
                <span className="text-green-600 text-xl">✓</span>
                <div>
                  <p className="font-medium text-green-800">
                    录音已保存
                    {segmentCount > 1 && (
                      <span className="ml-2 text-xs bg-green-200 text-green-700 px-2 py-0.5 rounded-full">
                        共 {segmentCount} 段，已合并
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-green-600">可继续收听，随时点右上角「提交评分」</p>
                </div>
              </div>
            )}

            {material.type === 'video' && (material.mediaUrl || material.mediaBlob) && (
              <div className="bg-black rounded-xl overflow-hidden">
                <video ref={mediaVideoRef} className="w-full" controls onEnded={handleMediaEnded} />
              </div>
            )}

            {material.type === 'audio' && (material.mediaUrl || material.mediaBlob) && (
              <div className="bg-gray-100 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2 text-sm text-gray-500">
                  <Volume2 className="w-4 h-4" />
                  <span>音频播放器</span>
                  {state === 'playing' && (
                    <span className="ml-auto flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> 播放中
                    </span>
                  )}
                  {state === 'auto-paused' && (
                    <span className="ml-auto flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> 已暂停（录音中）
                    </span>
                  )}
                  {state === 'recording' && (
                    <span className="ml-auto flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> 录音中
                      {segmentCount > 0 && <span className="ml-1">（已存 {segmentCount} 段）</span>}
                    </span>
                  )}
                </div>
                <audio ref={mediaAudioRef} className="w-full" controls onEnded={handleMediaEnded} />
              </div>
            )}

            {(material.interpretationType === 'sight' || showSource) && material.sourceContent && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-700">原文（{material.sourceLanguage === 'en' ? '英文' : '中文'}）</h3>
                  {material.type === 'text' && material.interpretationType !== 'sight' && (
                    <button
                      onClick={() => ttsRef.current?.speak(material.sourceContent ?? '', material.sourceLanguage === 'en' ? 'en-US' : 'zh-CN')}
                      className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700"
                    >
                      <Volume2 className="w-4 h-4" /> 播放
                    </button>
                  )}
                </div>
                <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">{material.sourceContent}</p>
              </div>
            )}

            {(state === 'recording' || state === 'auto-paused') && (
              <div className="bg-white rounded-xl border border-red-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-700">实时转写</h3>
                  <div className="flex items-center gap-2 text-red-500">
                    <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" /> 录音中...
                  </div>
                </div>
                <div className="min-h-[80px] p-4 bg-gray-50 rounded-lg">
                  <p className="text-gray-700 whitespace-pre-wrap">{transcription || '开始说话…'}</p>
                </div>
              </div>
            )}

            {showReference && displayReference && (
              <div className="bg-green-50 rounded-xl border border-green-200 p-6">
                <h3 className="font-semibold text-green-700 mb-4">参考译文</h3>
                <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">{displayReference}</p>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-center gap-4 py-8">

              {state === 'ready' && !session && (
                <button onClick={handleStart} className="flex items-center gap-2 px-8 py-4 bg-indigo-600 text-white rounded-xl text-lg font-medium hover:bg-indigo-700 transition shadow-lg">
                  <Play className="w-6 h-6" /> 开始练习
                </button>
              )}

              {state === 'ready' && session && material.interpretationType !== 'simultaneous' && (
                <button onClick={startRecording} className="flex items-center gap-2 px-8 py-4 bg-red-500 text-white rounded-xl text-lg font-medium hover:bg-red-600 transition shadow-lg animate-pulse">
                  <Mic className="w-6 h-6" /> 开始录音
                </button>
              )}

              {state === 'playing' && material.interpretationType === 'consecutive' && (
                <div className="text-center">
                  <div className="flex items-center gap-2 text-indigo-600 mb-2">
                    <Volume2 className="w-6 h-6 animate-pulse" />
                    <span className="text-lg">正在播放原文…</span>
                  </div>
                  <p className="text-gray-500 text-sm">停顿处将自动暂停并自动开始录音</p>
                </div>
              )}

              {state === 'playing' && isSelfPaced && (
                <button onClick={startRecording} className="flex items-center gap-2 px-8 py-4 bg-red-500 text-white rounded-xl text-lg font-medium hover:bg-red-600 transition shadow-lg">
                  <Mic className="w-6 h-6" /> 开始录音
                </button>
              )}

              {(state === 'auto-paused' || state === 'recording') && (
                <button onClick={stopRecording} className="flex items-center gap-2 px-8 py-4 bg-gray-800 text-white rounded-xl text-lg font-medium hover:bg-gray-900 transition shadow-lg">
                  <Square className="w-6 h-6" /> 停止录音
                </button>
              )}

              {material.sourceContent && material.interpretationType !== 'sight' && (
                <button onClick={() => setShowSource(!showSource)} className="flex items-center gap-2 px-6 py-3 border border-gray-300 rounded-xl hover:bg-gray-50 transition">
                  {showSource ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  {showSource ? '隐藏' : '查看'}原文
                </button>
              )}

              {displayReference && (
                <button onClick={() => setShowReference(!showReference)} className="flex items-center gap-2 px-6 py-3 border border-gray-300 rounded-xl hover:bg-gray-50 transition">
                  {showReference ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  {showReference ? '隐藏' : '查看'}参考译文
                </button>
              )}

            </div>
          </div>
        )}
      </div>
    </div>
  );
}