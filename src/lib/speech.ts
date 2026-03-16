import { transcribeAudio } from './translate';

// ── Web Speech API 实时转写 ───────────────────────────────────

export class SpeechRecognizer {
  private recognition: SpeechRecognition | null = null;
  private isListening: boolean = false;
  private transcript: string = '';

  constructor(language: 'en-US' | 'zh-CN' = 'zh-CN') {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognitionAPI =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      this.recognition = new SpeechRecognitionAPI();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = language;
    }
  }

  setLanguage(language: 'en-US' | 'zh-CN'): void {
    if (this.recognition) this.recognition.lang = language;
  }

  start(
    onResult: (transcript: string, isFinal: boolean) => void,
    onError?: (error: string) => void
  ): void {
    if (!this.recognition) {
      onError?.('浏览器不支持语音识别');
      return;
    }
    this.transcript = '';

    this.recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalTranscript += t;
        else interimTranscript += t;
      }
      if (finalTranscript) {
        this.transcript += finalTranscript;
        onResult(this.transcript, true);
      } else {
        onResult(this.transcript + interimTranscript, false);
      }
    };

    this.recognition.onerror = (event) => {
      console.error('语音识别错误:', event.error);
      onError?.(event.error);
    };

    this.recognition.onend = () => {
      if (this.isListening) this.recognition?.start();
    };

    this.isListening = true;
    this.recognition.start();
  }

  stop(): string {
    this.isListening = false;
    this.recognition?.stop();
    return this.transcript;
  }

  isSupported(): boolean {
    return this.recognition !== null;
  }
}

// ── Whisper 精确转录（提交评分时使用） ───────────────────────

export async function whisperTranscribe(
  audioBlob: Blob,
  language: 'en' | 'zh'
): Promise<string> {
  try {
    return await transcribeAudio(audioBlob, language);
  } catch (e) {
    console.warn('Whisper 转录失败，降级使用 Web Speech 结果', e);
    return '';
  }
}

// ── TTS 文本语音合成 ──────────────────────────────────────────

export class TextToSpeech {
  private synth: SpeechSynthesis;
  private utterance: SpeechSynthesisUtterance | null = null;

  constructor() {
    this.synth = window.speechSynthesis;
  }

  speak(text: string, language: 'en-US' | 'zh-CN' = 'en-US', onEnd?: () => void): void {
    this.stop();
    this.utterance = new SpeechSynthesisUtterance(text);
    this.utterance.lang = language;
    this.utterance.rate = 0.9;
    this.utterance.pitch = 1;
    if (onEnd) this.utterance.onend = onEnd;
    this.synth.speak(this.utterance);
  }

  stop(): void { this.synth.cancel(); }
  pause(): void { this.synth.pause(); }
  resume(): void { this.synth.resume(); }
  isSpeaking(): boolean { return this.synth.speaking; }
}