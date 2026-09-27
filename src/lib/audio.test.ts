import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { BrowserAudio } from "./audio";

const voice = (voiceURI: string, lang = "ja-JP", localService = true) =>
  ({ voiceURI, name: voiceURI, lang, localService, default: false }) as SpeechSynthesisVoice;
const options = { voiceURI: "", rate: 1, volume: 0.6 };

class Utterance {
  voice: SpeechSynthesisVoice | null = null;
  lang = "";
  rate = 1;
  pitch = 1;
  volume = 1;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}

let available: SpeechSynthesisVoice[];
let events: EventTarget;
let spoken: Utterance[];
let synthesis: { getVoices: ReturnType<typeof vi.fn>; speak: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn>; addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> };
let onVoices: Mock<(voices: SpeechSynthesisVoice[]) => void>;
let onNotice: Mock<(notice: string) => void>;
let onKeyNotice: Mock<(notice: string) => void>;
let audio: BrowserAudio;

beforeEach(() => {
  vi.useFakeTimers();
  available = [voice("local")];
  events = new EventTarget();
  spoken = [];
  synthesis = {
    getVoices: vi.fn(() => available),
    speak: vi.fn((utterance: Utterance) => spoken.push(utterance)),
    cancel: vi.fn(),
    addEventListener: vi.fn(events.addEventListener.bind(events)),
    removeEventListener: vi.fn(events.removeEventListener.bind(events)),
  };
  vi.stubGlobal("window", { speechSynthesis: synthesis, SpeechSynthesisUtterance: Utterance });
  onVoices = vi.fn();
  onNotice = vi.fn();
  onKeyNotice = vi.fn();
  audio = new BrowserAudio({ onVoices, onNotice, onKeyNotice });
});

afterEach(() => {
  audio.dispose();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("Japanese browser speech", () => {
  it("has a pure constructor and handles late Japanese voice discovery", () => {
    expect(synthesis.getVoices).not.toHaveBeenCalled();
    expect(onVoices).not.toHaveBeenCalled();
    available = [];
    audio.initialize();
    expect(onVoices).toHaveBeenLastCalledWith([]);
    available = [voice("english", "en-US"), voice("remote", "ja", false)];
    events.dispatchEvent(new Event("voiceschanged"));
    expect(onVoices).toHaveBeenLastCalledWith([available[1]]);
    audio.speak("こんにちは", options);
    expect(spoken[0].voice).toBe(available[1]);
  });

  it("honors the selected voice, then falls back to local Japanese with notice", () => {
    available = [voice("english", "en-US"), voice("remote", "ja-JP", false), voice("local")];
    audio.initialize();
    audio.speak("あ", { ...options, voiceURI: "remote" });
    expect(spoken[0].voice).toBe(available[1]);
    audio.speak("い", { ...options, voiceURI: "gone" });
    expect(spoken[1].voice).toBe(available[2]);
    expect(onNotice).toHaveBeenCalledWith(expect.stringContaining("所选"));
  });

  it("prefers local Kyoko automatically but preserves explicit choices and local fallback", () => {
    available = [voice("Hattori"), voice("Kyoko"), voice("O-Ren")];
    audio.initialize();
    audio.speak("こんにちは", options);
    expect(spoken[0].voice).toBe(available[1]);
    audio.speak("あ", { ...options, voiceURI: "Hattori" });
    expect(spoken[1].voice).toBe(available[0]);
    audio.speak("い", { ...options, voiceURI: "gone" });
    expect(spoken[2].voice).toBe(available[1]);
    available = [voice("Kyoko", "ja-JP", false), voice("local")];
    audio.speak("う", options);
    expect(spoken[3].voice).toBe(available[1]);
    available = [voice("online", "ja-JP", false), voice("Kyoko", "ja-JP", false)];
    audio.speak("え", options);
    expect(spoken[4].voice).toBe(available[1]);
  });

  it("applies selected pitch independently from rate and safely bounds invalid values", () => {
    audio.initialize();
    audio.speak("こんにちは", { ...options, pitch: 1.15 });
    expect(spoken[0]).toMatchObject({ pitch: 1.15, rate: 1, volume: 0.6 });
    audio.speak("あ", options);
    expect(spoken[1].pitch).toBe(1);
    audio.speak("い", { ...options, pitch: Number.NaN });
    expect(spoken[2].pitch).toBe(1);
    audio.speak("う", { ...options, pitch: 5 });
    expect(spoken[3].pitch).toBe(2);
  });

  it("never uses a non-Japanese voice and asynchronously continues the exercise", () => {
    available = [voice("english", "en-US")];
    audio.initialize();
    const done = vi.fn();
    audio.speak("あ", options, done);
    expect(done).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(spoken).toHaveLength(0);
    expect(done).toHaveBeenCalledOnce();
    expect(onNotice).toHaveBeenCalledWith(expect.stringContaining("未找到日语"));
  });

  it("contains inaccessible speech initialization and failed voice enumeration", () => {
    synthesis.getVoices.mockImplementation(() => { throw new Error("denied"); });
    expect(() => audio.initialize()).not.toThrow();
    expect(onVoices).toHaveBeenLastCalledWith([]);
    audio.dispose();
    vi.stubGlobal("window", { get speechSynthesis() { throw new Error("denied"); } });
    expect(() => audio.initialize()).not.toThrow();
    const done = vi.fn();
    audio.speak("あ", options, done);
    vi.runAllTimers();
    expect(done).toHaveBeenCalledOnce();
  });

  it("silently skips muted speech and keys without requiring any browser APIs", () => {
    vi.stubGlobal("window", {});
    audio.initialize();
    const done = vi.fn();
    audio.speak("あ", { ...options, volume: 0 }, done);
    audio.key(0);
    expect(done).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(done).toHaveBeenCalledOnce();
    expect(onNotice).not.toHaveBeenCalled();
  });

  it("reports missing or throwing speech APIs and finishes exactly once", () => {
    vi.stubGlobal("window", {});
    audio.initialize();
    const done = vi.fn();
    audio.speak("あ", options, done);
    vi.runAllTimers();
    expect(done).toHaveBeenCalledOnce();
    expect(onNotice).toHaveBeenCalledWith(expect.stringContaining("不支持"));
    audio.dispose();
    vi.stubGlobal("window", { speechSynthesis: synthesis, SpeechSynthesisUtterance: Utterance });
    audio.initialize();
    synthesis.speak.mockImplementation(() => { throw new Error("blocked"); });
    audio.speak("い", options, done);
    vi.runAllTimers();
    expect(done).toHaveBeenCalledTimes(2);
  });

  it("ignores late callbacks from canceled/replaced speech and invokes latest completion once", () => {
    audio.initialize();
    const first = vi.fn();
    const latest = vi.fn();
    audio.speak("あ", options, first);
    const oldEnd = spoken[0].onend!;
    const oldStart = spoken[0].onstart!;
    audio.speak("い", options, latest);
    const end = spoken[1].onend!;
    const error = spoken[1].onerror!;
    oldStart();
    oldEnd();
    expect(first).not.toHaveBeenCalled();
    expect(latest).not.toHaveBeenCalled();
    end();
    error();
    vi.runAllTimers();
    expect(latest).toHaveBeenCalledOnce();
    expect(onNotice).not.toHaveBeenCalled();
  });

  it("cancels both deferred skips and started speech without a completion", () => {
    audio.initialize();
    const done = vi.fn();
    audio.speak("あ", { ...options, volume: 0 }, done);
    audio.stopSpeech();
    vi.runAllTimers();
    audio.speak("い", options, done);
    spoken[0].onstart!();
    const end = spoken[0].onend!;
    audio.stopAll();
    end();
    vi.runAllTimers();
    expect(done).not.toHaveBeenCalled();
  });

  it("finishes a speech error once even if the engine later emits end", () => {
    audio.initialize();
    const done = vi.fn();
    audio.speak("あ", options, done);
    const error = spoken[0].onerror!;
    const end = spoken[0].onend!;
    error();
    end();
    vi.runAllTimers();
    expect(done).toHaveBeenCalledOnce();
    expect(onNotice).toHaveBeenCalledOnce();
  });

  it("bounds failure to start at 5 seconds and guards late start/end callbacks", () => {
    audio.initialize();
    const done = vi.fn();
    audio.speak("あ", options, done);
    const start = spoken[0].onstart!;
    const end = spoken[0].onend!;
    vi.advanceTimersByTime(4999);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    start();
    end();
    vi.runAllTimers();
    expect(done).toHaveBeenCalledOnce();
    expect(onNotice).toHaveBeenCalledWith(expect.stringContaining("未能启动"));
  });

  it("uses a generous length/rate watchdog after playback starts", () => {
    audio.initialize();
    const done = vi.fn();
    audio.speak("あ".repeat(100), { ...options, rate: 0.5 }, done);
    spoken[0].onstart!();
    vi.advanceTimersByTime(214_999);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(done).toHaveBeenCalledOnce();
    expect(onNotice).toHaveBeenCalledWith(expect.stringContaining("超时"));
  });

  it("detaches on disposal, clears timers and supports StrictMode reinitialization", () => {
    audio.initialize();
    audio.initialize();
    expect(synthesis.addEventListener).toHaveBeenCalledOnce();
    const done = vi.fn();
    audio.speak("あ", options, done);
    const end = spoken[0].onend!;
    audio.dispose();
    expect(synthesis.removeEventListener).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    onVoices.mockClear();
    events.dispatchEvent(new Event("voiceschanged"));
    expect(onVoices).not.toHaveBeenCalled();
    audio.initialize();
    audio.speak("い", options, done);
    end();
    expect(done).not.toHaveBeenCalled();
    spoken[1].onend!();
    expect(done).toHaveBeenCalledOnce();
  });
});

class MockContext {
  static instances: MockContext[] = [];
  state = "running";
  currentTime = 0;
  sampleRate = 48000;
  destination = {};
  resume = vi.fn(async () => { this.state = "running"; });
  close = vi.fn(async () => { this.state = "closed"; });
  createOscillator = vi.fn(() => ({
    type: "", frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null,
  }));
  createGain = vi.fn(() => ({
    gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn<(value: number, time: number) => void>() },
    connect: vi.fn(), disconnect: vi.fn(),
  }));
  createBuffer = vi.fn((_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) }));
  createBufferSource = vi.fn(() => ({ buffer: null, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() }));
  createBiquadFilter = vi.fn(() => ({ type: "", frequency: { setValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() }));
  constructor() { MockContext.instances.push(this); }
}

describe("electronic key feedback", () => {
  beforeEach(() => {
    MockContext.instances = [];
    Object.assign(window, { AudioContext: MockContext });
    vi.spyOn(performance, "now").mockImplementation(() => Date.now());
    audio.initialize();
  });

  async function suspended() {
    await audio.unlock();
    const context = MockContext.instances[0];
    context.state = "suspended";
    let finish!: () => void;
    context.resume.mockImplementation(() => new Promise<void>((done) => { finish = done; }));
    return { context, resume: async () => {
      context.state = "running";
      finish();
      await vi.advanceTimersByTimeAsync(0);
    } };
  }

  it("lazily creates a short 420Hz electronic tone with audible default gain", () => {
    expect(MockContext.instances).toHaveLength(0);
    audio.key(0.25);
    const context = MockContext.instances[0];
    const oscillator = context.createOscillator.mock.results[0].value;
    expect(oscillator.type).toBe("square");
    expect(oscillator.frequency.setValueAtTime).toHaveBeenCalledWith(420, 0);
    expect(oscillator.stop).toHaveBeenCalledWith(0.09);
    const levels: [number, number][] = context.createGain.mock.results[0].value.gain.exponentialRampToValueAtTime.mock.calls;
    expect(levels.some(([gain]) => gain >= 0.05 && gain <= 0.2)).toBe(true);
    expect(onKeyNotice).toHaveBeenLastCalledWith("");
    expect(onNotice).not.toHaveBeenCalled();
  });

  it("bounds simultaneous tones and frees nodes on end, stop and disposal", () => {
    for (let index = 0; index < 20; index++) audio.key(1);
    const context = MockContext.instances[0];
    expect(context.createOscillator).toHaveBeenCalledTimes(20);
    expect(vi.getTimerCount()).toBe(4);
    expect(context.createOscillator.mock.results[0].value.disconnect).toHaveBeenCalled();
    audio.stopKeys();
    expect(vi.getTimerCount()).toBe(0);
    for (const { value } of context.createOscillator.mock.results) expect(value.disconnect).toHaveBeenCalled();
    for (const { value } of context.createGain.mock.results) expect(value.disconnect).toHaveBeenCalled();
    audio.key(0.25);
    const last = context.createOscillator.mock.results.at(-1)!.value as unknown as OscillatorNode;
    last.onended?.call(last, new Event("ended"));
    expect(vi.getTimerCount()).toBe(0);
    audio.dispose();
    expect(context.close).toHaveBeenCalledOnce();
  });

  it("recovers the first key and only the newest of several pending keys within 100ms", async () => {
    const { context, resume } = await suspended();
    audio.key(0.1);
    await vi.advanceTimersByTimeAsync(60);
    audio.key(1);
    await vi.advanceTimersByTimeAsync(60);
    expect(context.resume).toHaveBeenCalledOnce();
    expect(context.createOscillator).not.toHaveBeenCalled();
    await resume();
    expect(context.createOscillator).toHaveBeenCalledOnce();
    expect(context.createGain.mock.results[0].value.gain.exponentialRampToValueAtTime)
      .toHaveBeenCalledWith(0.18, 0.01);
  });

  it("drops keys older than 100ms instead of replaying a backlog", async () => {
    const { context, resume } = await suspended();
    audio.key(0.25);
    await vi.advanceTimersByTimeAsync(101);
    await resume();
    expect(context.createOscillator).not.toHaveBeenCalled();
    audio.key(0.25);
    expect(context.createOscillator).toHaveBeenCalledOnce();
  });

  it.each(["stopKeys", "stopAll", "dispose"] as const)("%s cancels a pending key even if resume finishes later", async (action) => {
    const { context, resume } = await suspended();
    audio.key(0.25);
    audio[action]();
    await resume();
    expect(context.createOscillator).not.toHaveBeenCalled();
  });

  it("zero volume cancels pending keys and never initializes new audio resources", async () => {
    audio.key(0);
    expect(MockContext.instances).toHaveLength(0);
    const { context, resume } = await suspended();
    audio.key(0.25);
    audio.key(0);
    await resume();
    expect(context.createOscillator).not.toHaveBeenCalled();
  });

  it("recovers a rejected resume on retry without changing speech notices", async () => {
    await audio.unlock();
    const context = MockContext.instances[0];
    context.state = "suspended";
    context.resume.mockRejectedValueOnce(new Error("blocked"));
    audio.key(0.25);
    await vi.advanceTimersByTimeAsync(0);
    expect(onKeyNotice).toHaveBeenLastCalledWith(expect.stringContaining("重试"));
    expect(onNotice).not.toHaveBeenCalled();
    audio.key(0.25);
    await vi.advanceTimersByTimeAsync(0);
    expect(context.createOscillator).toHaveBeenCalledOnce();
    expect(onKeyNotice).toHaveBeenLastCalledWith("");
  });

  it("allows a fresh resume after cancellation and ignores the old failure", async () => {
    await audio.unlock();
    const context = MockContext.instances[0];
    context.state = "suspended";
    let rejectOld!: (error: Error) => void;
    let rejectNew!: (error: Error) => void;
    context.resume.mockImplementationOnce(() => new Promise<void>((_, fail) => { rejectOld = fail; }));
    context.resume.mockImplementationOnce(() => new Promise<void>((_, fail) => { rejectNew = fail; }));
    onKeyNotice.mockClear();
    audio.key(0.25);
    audio.stopKeys();
    audio.key(0.25);
    expect(context.resume).toHaveBeenCalledTimes(2);
    rejectOld(new Error("old request"));
    await vi.advanceTimersByTimeAsync(0);
    expect(onKeyNotice).not.toHaveBeenCalled();
    rejectNew(new Error("blocked"));
    await vi.advanceTimersByTimeAsync(0);
    expect(onKeyNotice).toHaveBeenLastCalledWith(expect.stringContaining("重试"));
    expect(context.createOscillator).not.toHaveBeenCalled();
    audio.key(0.25);
    await vi.advanceTimersByTimeAsync(0);
    expect(context.createOscillator).toHaveBeenCalledOnce();
  });

  it("contains unsupported, construction and node failures and can retry", () => {
    Object.assign(window, { AudioContext: undefined });
    audio.key(0.25);
    expect(onKeyNotice).toHaveBeenLastCalledWith(expect.stringContaining("不支持"));
    Object.assign(window, { AudioContext: class { constructor() { throw new Error("denied"); } } });
    expect(() => audio.key(0.25)).not.toThrow();
    expect(onKeyNotice).toHaveBeenLastCalledWith(expect.stringContaining("重试"));
    Object.assign(window, { AudioContext: MockContext });
    audio.unlock();
    const context = MockContext.instances[0];
    context.createGain.mockImplementationOnce(() => { throw new Error("node failed"); });
    audio.key(0.25);
    expect(context.createOscillator.mock.results[0].value.disconnect).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(onKeyNotice).toHaveBeenLastCalledWith(expect.stringContaining("重试"));
    audio.key(0.25);
    expect(onKeyNotice).toHaveBeenLastCalledWith("");
  });

  it("does not revive disposed requests after StrictMode reinitialization", async () => {
    const { context, resume } = await suspended();
    audio.key(0.25);
    audio.dispose();
    audio.initialize();
    audio.key(0.25);
    await resume();
    expect(context.createOscillator).not.toHaveBeenCalled();
    expect(MockContext.instances[1].createOscillator).toHaveBeenCalledOnce();
  });

  it("replaces a closed context and resumes an interrupted context", async () => {
    await audio.unlock();
    MockContext.instances[0].state = "closed";
    audio.key(0.25);
    const context = MockContext.instances[1];
    expect(context.createOscillator).toHaveBeenCalledOnce();
    context.state = "interrupted";
    audio.key(0.25);
    await vi.advanceTimersByTimeAsync(0);
    expect(context.resume).toHaveBeenCalledOnce();
    expect(context.createOscillator).toHaveBeenCalledTimes(2);
  });
});
