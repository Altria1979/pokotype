export type AudioNoticeCode = "keyUnsupported" | "keyFailed" | "speechUnsupported" | "speechMissing" | "speechFallback" | "speechFailed" | "speechTimedOut" | "speechNotStarted";

type AudioCallbacks = {
  onVoices: (voices: SpeechSynthesisVoice[]) => void;
  onNotice: (notice: string) => void;
  onKeyNotice: (notice: string) => void;
  translateNotice?: (code: AudioNoticeCode) => string;
};

export type SpeechOptions = { voiceURI: string; rate: number; volume: number; pitch?: number };

type Click = {
  oscillator: OscillatorNode;
  gain: GainNode;
  timer: ReturnType<typeof setTimeout>;
};

const clamp = (value: number, min: number, max: number, fallback: number) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

/** Browser resources are acquired only after initialize/user interaction. */
export class BrowserAudio {
  private initialized = false;
  private synthesis: SpeechSynthesis | undefined;
  private voices: SpeechSynthesisVoice[] = [];
  private utterance: SpeechSynthesisUtterance | undefined;
  private speechGeneration = 0;
  private speechTimer: ReturnType<typeof setTimeout> | undefined;
  private context: AudioContext | undefined;
  private resuming: Promise<void> | undefined;
  private clicks = new Set<Click>();
  private keyGeneration = 0;
  private pendingKey: { volume: number; requestedAt: number } | undefined;

  constructor(private readonly callbacks: AudioCallbacks) {}

  private noticeText(code: AudioNoticeCode, fallback: string) {
    return this.callbacks.translateNotice?.(code) ?? fallback;
  }

  initialize() {
    if (this.initialized) return;
    this.initialized = true;
    if (typeof window !== "undefined") {
      try {
        this.synthesis = window.speechSynthesis;
        this.synthesis?.addEventListener("voiceschanged", this.refreshVoices);
      } catch {
        this.synthesis = undefined;
      }
    }
    this.refreshVoices();
  }

  private refreshVoices = () => {
    if (!this.initialized) return;
    try {
      this.voices = (this.synthesis?.getVoices() ?? []).filter((voice) => /^ja(?:[-_]|$)/i.test(voice.lang));
    } catch {
      this.voices = [];
    }
    this.callbacks.onVoices(this.voices);
  };

  /** Acquire/resume only in response to a user gesture. */
  unlock(): Promise<void> {
    if (!this.initialized || typeof window === "undefined") return Promise.resolve();
    try {
      if (!this.context || this.context.state === "closed") {
        const Constructor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Constructor) {
          this.callbacks.onKeyNotice(this.noticeText("keyUnsupported", "当前浏览器不支持按键音效。"));
          return Promise.resolve();
        }
        this.stopKeys();
        this.context = new Constructor();
      }
      const context = this.context;
      if (context.state === "running") {
        this.callbacks.onKeyNotice("");
      } else if (!this.resuming) {
        const generation = this.keyGeneration;
        const failed = () => {
          if (this.initialized && this.context === context && generation === this.keyGeneration)
            this.callbacks.onKeyNotice(this.noticeText("keyFailed", "按键音效未能播放，请点击“重试按键音”。"));
        };
        // Also covers Safari's interrupted state without treating it as running.
        const pending = context.resume().then(() => {
          if (context.state !== "running") failed();
        }).catch(failed).finally(() => {
          if (this.resuming === pending) this.resuming = undefined;
        });
        this.resuming = pending;
      }
    } catch {
      this.callbacks.onKeyNotice(this.noticeText("keyFailed", "按键音效未能播放，请点击“重试按键音”。"));
    }
    return this.resuming ?? Promise.resolve();
  }

  key(volume: number) {
    const level = clamp(volume, 0, 1, 0);
    if (!this.initialized) return;
    if (level === 0) {
      this.stopKeys();
      return;
    }
    const request = { volume: level, requestedAt: performance.now() };
    const resumed = this.unlock();
    const context = this.context;
    if (!context) return;
    this.pendingKey = undefined;
    if (context.state === "running") {
      this.playKey(context, level);
      return;
    }
    this.pendingKey = request;
    void resumed.then(() => {
      if (!this.initialized || this.context !== context || this.pendingKey !== request) return;
      this.pendingKey = undefined;
      if (context.state !== "running") {
        this.callbacks.onKeyNotice(this.noticeText("keyFailed", "按键音效未能播放，请点击“重试按键音”。"));
        return;
      }
      if (performance.now() - request.requestedAt <= 100)
        this.playKey(context, request.volume);
    });
  }

  private playKey(context: AudioContext, level: number) {
    // Four voices with at most 0.18 gain each leave headroom even for rapid input.
    while (this.clicks.size >= 4) this.releaseClick(this.clicks.values().next().value!);
    let oscillator: OscillatorNode | undefined;
    let gain: GainNode | undefined;
    let click: Click | undefined;
    try {
      oscillator = context.createOscillator();
      gain = context.createGain();
      const now = context.currentTime;
      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(420, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, 0.18 * Math.sqrt(level)), now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
      gain.gain.setValueAtTime(0, now + 0.09);
      oscillator.connect(gain);
      gain.connect(context.destination);
      const activeClick: Click = { oscillator, gain, timer: setTimeout(() => this.releaseClick(activeClick), 150) };
      click = activeClick;
      this.clicks.add(activeClick);
      oscillator.onended = () => this.releaseClick(activeClick);
      oscillator.start(now);
      oscillator.stop(now + 0.09);
      this.callbacks.onKeyNotice("");
    } catch {
      if (click) this.releaseClick(click);
      else {
        try { oscillator?.stop(); } catch {}
        try { oscillator?.disconnect(); } catch {}
        try { gain?.disconnect(); } catch {}
      }
      this.callbacks.onKeyNotice(this.noticeText("keyFailed", "按键音效未能播放，请点击“重试按键音”。"));
    }
  }

  private releaseClick(click: Click) {
    clearTimeout(click.timer);
    click.oscillator.onended = null;
    try { click.oscillator.stop(); } catch {}
    try { click.oscillator.disconnect(); } catch {}
    try { click.gain.disconnect(); } catch {}
    this.clicks.delete(click);
  }

  stopKeys() {
    this.keyGeneration += 1;
    this.pendingKey = undefined;
    this.resuming = undefined;
    for (const click of this.clicks) this.releaseClick(click);
  }

  stopSpeech() {
    this.speechGeneration += 1;
    clearTimeout(this.speechTimer);
    this.speechTimer = undefined;
    const utterance = this.utterance;
    this.utterance = undefined;
    if (utterance) {
      utterance.onstart = utterance.onend = utterance.onerror = null;
      try { this.synthesis?.cancel(); } catch {}
    }
  }

  stopAll() {
    this.stopSpeech();
    this.stopKeys();
  }

  speak(text: string, options: SpeechOptions, onDone?: () => void) {
    this.stopSpeech();
    if (!this.initialized) return;
    const generation = this.speechGeneration;
    const finish = (notice?: string) => {
      if (!this.initialized || generation !== this.speechGeneration) return;
      this.stopSpeech();
      if (notice) this.callbacks.onNotice(notice);
      onDone?.();
    };
    const skip = (notice?: string) => {
      this.speechTimer = setTimeout(() => finish(notice), 0);
    };
    if (clamp(options.volume, 0, 1, 0) === 0 || !text.trim()) {
      skip();
      return;
    }
    if (!this.synthesis || typeof window.SpeechSynthesisUtterance !== "function") {
      skip(this.noticeText("speechUnsupported", "当前浏览器不支持语音朗读，可继续打字练习。"));
      return;
    }
    this.refreshVoices();
    const requested = this.voices.find((voice) => voice.voiceURI === options.voiceURI);
    // Voice metadata has no gender field. Prefer the known Kyoko voice when
    // available, while retaining local-first selection and explicit choices.
    const localVoices = this.voices.filter((item) => item.localService);
    const automaticVoices = localVoices.length ? localVoices : this.voices;
    const automatic = automaticVoices.find((item) => /\bkyoko\b/i.test(item.name)) ?? automaticVoices[0];
    const voice = requested ?? automatic;
    if (!voice) {
      skip(this.noticeText("speechMissing", "未找到日语语音，请在系统中安装日语语音后重试；可继续打字练习。"));
      return;
    }
    if (options.voiceURI && !requested) this.callbacks.onNotice(this.noticeText("speechFallback", "所选日语语音不可用，已使用其他日语语音。"));
    try {
      const utterance = new window.SpeechSynthesisUtterance(text);
      this.utterance = utterance;
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.rate = clamp(options.rate, 0.1, 10, 1);
      utterance.pitch = clamp(options.pitch ?? 1, 0, 2, 1);
      utterance.volume = clamp(options.volume, 0, 1, 1);
      utterance.onend = () => finish();
      utterance.onerror = () => finish(this.noticeText("speechFailed", "日语朗读暂时无法播放，可继续打字练习。"));
      utterance.onstart = () => {
        if (generation !== this.speechGeneration || !this.initialized) return;
        clearTimeout(this.speechTimer);
        // Allow slow voices and long sentences, while bounding a lost end event.
        const playbackMs = Math.max(30_000, text.length * 1_000 / utterance.rate + 15_000);
        this.speechTimer = setTimeout(() => finish(this.noticeText("speechTimedOut", "日语朗读超时，已停止播放。")), playbackMs);
      };
      this.speechTimer = setTimeout(() => finish(this.noticeText("speechNotStarted", "日语朗读未能启动，可继续打字练习。")), 5_000);
      this.synthesis.speak(utterance);
    } catch {
      clearTimeout(this.speechTimer);
      skip(this.noticeText("speechFailed", "日语朗读暂时无法播放，可继续打字练习。"));
    }
  }

  dispose() {
    this.initialized = false;
    this.stopAll();
    try { this.synthesis?.removeEventListener("voiceschanged", this.refreshVoices); } catch {}
    this.synthesis = undefined;
    this.voices = [];
    const context = this.context;
    this.context = undefined;
    this.resuming = undefined;
    try { void context?.close().catch(() => {}); } catch {}
  }
}
