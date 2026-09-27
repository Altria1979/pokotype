import { expect, test, type Page } from "@playwright/test";
import { SAMPLE_ARTICLES } from "../src/lib/articles";
import { DEFAULT_PREFERENCES } from "../src/lib/storage";

type AudioMeasurement = {
  peak: number;
  rms: number;
  dominantFrequency: number;
  frames: number;
  states: AudioContextState[];
  nativeContexts: boolean;
};

declare global {
  interface Window {
    __nativeKeyAudio: {
      contexts: AudioContext[];
      currentPeak: number;
      begin(): void;
      finish(durationMs: number): Promise<AudioMeasurement>;
    };
  }
}

async function observeNativeAudio(page: Page, volume = 0.25) {
  await page.addInitScript((preferences) => {
    if (!localStorage.getItem("pokotype:preferences:v1")) {
      localStorage.setItem("pokotype:preferences:v1", JSON.stringify({ version: 1, value: preferences }));
    }
    const NativeContext = window.AudioContext;
    const nativeConnect = AudioNode.prototype.connect;
    const entries: {
      context: AudioContext;
      analyser: AnalyserNode;
      samples: Float32Array<ArrayBuffer>;
      spectrum: Float32Array<ArrayBuffer>;
    }[] = [];
    let recording = false;
    let measurement = { peak: 0, rms: 0, dominantFrequency: 0, frames: 0 };
    const snapshot = (): AudioMeasurement => ({
      ...measurement,
      states: entries.map(({ context }) => context.state),
      nativeContexts: entries.every(({ context }) => context instanceof NativeContext),
    });
    window.__nativeKeyAudio = {
      contexts: [],
      currentPeak: 0,
      begin() {
        measurement = { peak: 0, rms: 0, dominantFrequency: 0, frames: 0 };
        recording = true;
      },
      finish(durationMs) {
        // Observe a complete short tone plus its release through real audio time.
        return new Promise((resolve) => setTimeout(() => {
          recording = false;
          resolve(snapshot());
        }, durationMs));
      },
    };
    class ObservedContext extends NativeContext {
      constructor(options?: AudioContextOptions) {
        super(options);
        const analyser = this.createAnalyser();
        // Retain the whole 90 ms tone even when React work delays the next frame.
        analyser.fftSize = 8192;
        analyser.smoothingTimeConstant = 0;
        const silentSink = this.createGain();
        silentSink.gain.value = 0;
        // Keep the observation branch rendering without changing audible output.
        Reflect.apply(nativeConnect, analyser, [silentSink]);
        Reflect.apply(nativeConnect, silentSink, [this.destination]);
        entries.push({
          context: this,
          analyser,
          samples: new Float32Array(analyser.fftSize),
          spectrum: new Float32Array(analyser.frequencyBinCount),
        });
        window.__nativeKeyAudio.contexts.push(this);
      }
    }
    Object.defineProperty(window, "AudioContext", { configurable: true, value: ObservedContext });
    AudioNode.prototype.connect = function (
      this: AudioNode,
      ...args: [AudioNode | AudioParam, number?, number?]
    ) {
      const result = Reflect.apply(nativeConnect, this, args);
      if (args[0] === this.context.destination) {
        const entry = entries.find(({ context }) => context === this.context);
        if (entry) Reflect.apply(nativeConnect, this, [entry.analyser]);
      }
      return result;
    } as AudioNode["connect"];
    function sample() {
      let currentPeak = 0;
      if (recording) measurement.frames++;
      for (const entry of entries) {
        if (entry.context.state !== "running") continue;
        entry.analyser.getFloatTimeDomainData(entry.samples);
        let peak = 0;
        let squared = 0;
        for (const value of entry.samples) {
          peak = Math.max(peak, Math.abs(value));
          squared += value * value;
        }
        currentPeak = Math.max(currentPeak, peak);
        if (!recording) continue;
        measurement.peak = Math.max(measurement.peak, peak);
        const rms = Math.sqrt(squared / entry.samples.length);
        if (rms > measurement.rms) {
          measurement.rms = rms;
          entry.analyser.getFloatFrequencyData(entry.spectrum);
          let strongest = 1;
          for (let index = 2; index < entry.spectrum.length; index++) {
            if (entry.spectrum[index] > entry.spectrum[strongest]) strongest = index;
          }
          measurement.dominantFrequency = strongest * entry.context.sampleRate / entry.analyser.fftSize;
        }
      }
      window.__nativeKeyAudio.currentPeak = currentPeak;
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  }, {
    ...DEFAULT_PREFERENCES,
    keySoundEnabled: true,
    keySoundVolume: volume,
    kanaSpeechEnabled: false,
    articleSpeechEnabled: false,
    articleSegmentSpeechEnabled: false,
  });
}

async function measure(page: Page, action: () => Promise<unknown>) {
  await expect.poll(() => page.evaluate(() => window.__nativeKeyAudio.currentPeak)).toBeLessThan(0.0001);
  await page.evaluate(() => window.__nativeKeyAudio.begin());
  await action();
  const result = await page.evaluate(() => window.__nativeKeyAudio.finish(240));
  expect(result.frames).toBeGreaterThan(0);
  expect(result.nativeContexts).toBe(true);
  await test.info().attach("native-audio-measurement", {
    body: JSON.stringify(result), contentType: "application/json",
  });
  return result;
}

function expectTone(result: AudioMeasurement) {
  // Deliberately broad signal bounds: reject silence/near-inaudible output and clipping,
  // without comparing exact samples or depending on the device sample rate.
  expect(result.peak).toBeGreaterThan(0.04);
  expect(result.peak).toBeLessThan(0.98);
  expect(result.rms).toBeGreaterThan(0.005);
  expect(result.dominantFrequency).toBeGreaterThan(300);
  expect(result.dominantFrequency).toBeLessThan(600);
}

function expectSilence(result: AudioMeasurement) {
  expect(result.peak).toBeLessThan(0.0001);
}

async function startArticle(page: Page) {
  await page.getByRole("radio", { name: "逐句练习", exact: true }).check();
  await page.getByRole("button", { name: "开始文章练习", exact: true }).click();
  await expect(page.getByLabel("输入进度")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "按键音效", exact: true })).toBeChecked();
}

async function openArticleFromNavigation(page: Page) {
  await page.getByRole("navigation", { name: "主导航" }).getByRole("link", { name: "我的文章库", exact: true }).click();
  await page.getByRole("link").filter({
    has: page.getByRole("heading", { name: SAMPLE_ARTICLES[0].title, exact: true }),
  }).click();
  await startArticle(page);
}

test("原生音频：文章首键、后续正确和错键有信号，开关/暂停/恢复/退出再进入正常", async ({ page }) => {
  await observeNativeAudio(page);
  await page.goto(`/zh-CN/articles/?id=${SAMPLE_ARTICLES[0].id}`);
  await startArticle(page);
  expectTone(await measure(page, () => page.keyboard.type("w")));
  expectTone(await measure(page, () => page.keyboard.type("a")));
  expectTone(await measure(page, () => page.keyboard.type("q")));
  await expect(page.getByRole("status")).toContainText("这个按键不匹配");

  const enabled = page.getByRole("checkbox", { name: "按键音效", exact: true });
  await enabled.uncheck();
  expectSilence(await measure(page, () => page.keyboard.type("q")));
  await enabled.check();
  await page.keyboard.press("Escape");
  expectSilence(await measure(page, () => page.keyboard.type("q")));
  await page.getByRole("button", { name: "继续练习", exact: true }).click();
  expectTone(await measure(page, () => page.keyboard.type("q")));

  // Exercise the real context lifecycle, without faking its state or resume result.
  await page.evaluate(async () => {
    const context = window.__nativeKeyAudio.contexts.at(-1)!;
    await context.suspend();
  });
  expectTone(await measure(page, () => page.keyboard.type("q")));
  await page.getByRole("button", { name: "结束练习", exact: true }).click();
  expectSilence(await measure(page, () => page.keyboard.type("q")));
  await expect.poll(() => page.evaluate(() => window.__nativeKeyAudio.contexts.every((context) => context.state === "closed"))).toBe(true);
  const previousContexts = await page.evaluate(() => window.__nativeKeyAudio.contexts.length);
  await startArticle(page);
  expectTone(await measure(page, () => page.keyboard.type("q")));
  expect(await page.evaluate(() => window.__nativeKeyAudio.contexts.length)).toBeGreaterThan(previousContexts);
});

test("原生音频：五十音音量为零时静音，调整设置后首键和错键都有信号", async ({ page }) => {
  await observeNativeAudio(page, 0);
  await page.goto("/zh-CN/");
  await page.getByRole("button", { name: "开始练习 20 题", exact: true }).click();
  await expect(page.getByLabel("输入进度")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "按键音效", exact: true })).toBeChecked();
  await expect(page.getByText("按键音已开启，但音量为 0。调高音量后即可听到。", { exact: true })).toBeVisible();
  expectSilence(await measure(page, () => page.keyboard.type("q")));
  await expect(page.getByRole("link", { name: "调整声音设置", exact: true })).toHaveAttribute("href", "/zh-CN/settings/#sound-settings-title");
  await page.getByRole("link", { name: "调整声音设置", exact: true }).click();
  await page.getByLabel("按键音量", { exact: true }).fill("0.25");
  await page.getByRole("navigation", { name: "主导航" }).getByRole("link", { name: "五十音练习", exact: true }).click();
  await page.getByRole("button", { name: "开始练习 20 题", exact: true }).click();
  const progress = page.getByLabel("输入进度");
  await expect(progress).toBeVisible();
  const firstKey = (await progress.locator("[data-romaji-pending]").textContent())![0];
  expectTone(await measure(page, () => page.keyboard.type(firstKey)));
  expectTone(await measure(page, () => page.keyboard.type("q")));
});

test("原生音频：设置试听与文章按键声音一致，最高音量快速连按不削波也不残留", async ({ page }) => {
  await observeNativeAudio(page, 1);
  await page.goto("/zh-CN/settings/");
  const preview = await measure(page, () => page.getByRole("button", { name: "试听按键音", exact: true }).click());
  expectTone(preview);
  await openArticleFromNavigation(page);
  const single = await measure(page, () => page.keyboard.type("q"));
  expectTone(single);
  expect(Math.abs(single.dominantFrequency - preview.dominantFrequency)).toBeLessThan(50);
  expect(single.peak / preview.peak).toBeGreaterThan(0.6);
  expect(single.peak / preview.peak).toBeLessThan(1.6);
  const rapid = await measure(page, () => page.keyboard.type("q".repeat(32), { delay: 2 }));
  expectTone(rapid);
  expectSilence(await measure(page, async () => {}));
});
