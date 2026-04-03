/**
 * 自动暂停模块
 * 在目标时间窗口内检测静音段后暂停，播放滴声，等待后恢复
 * 支持多次触发（每次恢复后重新计算下一个窗口）
 */

export interface AutoPauseOptions {
  minTriggerTime?: number;   // 第一次最早触发（秒），默认 60
  maxTriggerTime?: number;   // 第一次最晚触发（秒），默认 95
  intervalMin?: number;      // 后续每段最短间隔（秒），默认与 minTriggerTime 相同
  intervalMax?: number;      // 后续每段最长间隔（秒），默认与 maxTriggerTime 相同
  resumeDelay?: number;      // 暂停等待时间 ms，默认 120000
  silenceThreshold?: number; // 静音阈值 0-255，默认 15
  silenceDuration?: number;  // 持续静音 ms 才触发，默认 600
  onPause?: () => void;
  onResume?: () => void;
  onBeep?: () => void;
}

export class AutoPauseController {
  private audio: HTMLAudioElement;
  private opts: Required<AutoPauseOptions>;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private rafId: number | null = null;
  private resumeTimer: ReturnType<typeof setTimeout> | null = null;
  private silenceStart: number | null = null;
  private isWatching = false;
  private isPaused = false;
  // 当前窗口的触发时间范围
  private windowStart = 0;
  private windowEnd = 0;

  constructor(audio: HTMLAudioElement, opts: AutoPauseOptions = {}) {
    this.audio = audio;
    const minT = opts.minTriggerTime ?? 60;
    const maxT = opts.maxTriggerTime ?? 95;
    this.opts = {
      minTriggerTime:   minT,
      maxTriggerTime:   maxT,
      intervalMin:      opts.intervalMin      ?? minT,
      intervalMax:      opts.intervalMax      ?? maxT,
      resumeDelay:      opts.resumeDelay      ?? 120_000,
      silenceThreshold: opts.silenceThreshold ?? 15,
      silenceDuration:  opts.silenceDuration  ?? 600,
      onPause:  opts.onPause  ?? (() => {}),
      onResume: opts.onResume ?? (() => {}),
      onBeep:   opts.onBeep   ?? (() => {}),
    };
    // 初始窗口
    this.windowStart = this.opts.minTriggerTime;
    this.windowEnd   = this.opts.maxTriggerTime;
  }

  start() {
    if (this.isWatching) return;
    this.isWatching = true;
    this.isPaused = false;
    this.silenceStart = null;
    this._initAnalyser();
    this._watchLoop();
  }

  destroy() {
    this.isWatching = false;
    this.isPaused = false;
    if (this.rafId !== null) { cancelAnimationFrame(this.rafId); this.rafId = null; }
    if (this.resumeTimer !== null) { clearTimeout(this.resumeTimer); this.resumeTimer = null; }
    this._teardown();
  }

  reset() {
    this.destroy();
    this.windowStart = this.opts.minTriggerTime;
    this.windowEnd   = this.opts.maxTriggerTime;
  }

  /** 手动停止录音后调用，重新安排下一次暂停 */
  resumeEarly() {
    if (this.resumeTimer !== null) { clearTimeout(this.resumeTimer); this.resumeTimer = null; }
    this.isPaused = false;
    this._scheduleNextWindow();
    this.isWatching = true;
    this.silenceStart = null;
    if (!this.rafId) this._watchLoop();
  }

  private _scheduleNextWindow() {
    const base = this.audio.currentTime;
    const { intervalMin, intervalMax } = this.opts;
    const offset = intervalMin + Math.random() * (intervalMax - intervalMin);
    this.windowStart = base + offset;
    this.windowEnd   = base + offset + 15; // 15 秒窗口宽度
  }

  private _watchLoop() {
    if (!this.isWatching || this.isPaused) return;

    const currentTime = this.audio.currentTime;
    const { silenceDuration } = this.opts;

    if (currentTime >= this.windowStart && currentTime <= this.windowEnd) {
      if (this.analyser) {
        if (this._isSilent()) {
          if (this.silenceStart === null) {
            this.silenceStart = performance.now();
          } else if (performance.now() - this.silenceStart >= silenceDuration) {
            this._doPause();
            return;
          }
        } else {
          this.silenceStart = null;
        }
      } else {
        // 降级：进窗口直接暂停
        this._doPause();
        return;
      }
    }

    // 超过窗口末尾未触发，强制暂停
    if (currentTime > this.windowEnd) {
      this._doPause();
      return;
    }

    this.rafId = requestAnimationFrame(() => this._watchLoop());
  }

  private _isSilent(): boolean {
    if (!this.analyser) return false;
    const buf = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(buf);
    const avg = buf.reduce((s, v) => s + v, 0) / buf.length;
    return avg < this.opts.silenceThreshold;
  }

  private _doPause() {
    if (this.isPaused) return;
    this.isPaused = true;
    this.isWatching = false;
    if (this.rafId !== null) { cancelAnimationFrame(this.rafId); this.rafId = null; }

    this.audio.pause();
    playBeep();
    this.opts.onBeep();
    this.opts.onPause();

    this.resumeTimer = setTimeout(() => {
      this.isPaused = false;
      this.opts.onResume();
      this.audio.play().catch(() => {});
      // 恢复后安排下一次
      this._scheduleNextWindow();
      // 防止窗口落在当前时间之前（例如长时间暂停后播放位置已超过调度窗口）
      if (this.windowStart < this.audio.currentTime) {
        this.windowStart = this.audio.currentTime + 5;
        this.windowEnd = this.windowStart + 15;
      }
      this.isWatching = true;
      this.silenceStart = null;
      this._watchLoop();
    }, this.opts.resumeDelay);
  }

  private _initAnalyser() {
    try {
      if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
      if (!this.source) {
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 256;
        this.source = this.audioCtx.createMediaElementSource(this.audio);
        this.source.connect(this.analyser);
        this.analyser.connect(this.audioCtx.destination);
      }
    } catch (e) {
      console.warn('AudioContext 初始化失败，使用时间降级模式', e);
    }
  }

  private _teardown() {
    try { if (this.source) { this.source.disconnect(); this.source = null; } } catch (_) {}
    try { if (this.analyser) { this.analyser.disconnect(); this.analyser = null; } } catch (_) {}
    try { if (this.audioCtx && this.audioCtx.state !== 'closed') { this.audioCtx.close(); this.audioCtx = null; } } catch (_) {}
  }
}

export function playBeep(frequency = 880, duration = 0.45) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    gain.gain.setValueAtTime(0.35, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
    setTimeout(() => ctx.close(), (duration + 0.1) * 1000);
  } catch (_) {}
}
