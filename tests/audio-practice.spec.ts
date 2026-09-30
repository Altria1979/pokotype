import { expect, test, type Page } from "@playwright/test";
import { SAMPLE_ARTICLES, sentenceText } from "../src/lib/articles";
import type { PracticeRecord } from "../src/lib/storage";

const article = SAMPLE_ARTICLES[0];
const listening = "正在朗读 · 可跳过朗读";

type SpeechCall = {
  text: string;
  lang: string;
  volume: number;
  rate: number;
  pitch: number;
  voiceURI: string | null;
};
type SpeechMock = {
  calls: SpeechCall[];
  cancellations: number;
  active: number | null;
  emit: (index: number, type: "start" | "end" | "error") => void;
  setJapaneseAvailable: (available: boolean) => void;
};
declare global {
  interface Window {
    __practiceSpeech: SpeechMock;
    __practiceKeyClicks: number;
    __practiceKeyAudioBlocked: boolean;
  }
}

async function mockSpeech(page: Page, japaneseAvailable = true) {
  await page.addInitScript(({ japaneseAvailable }) => {
    window.__practiceKeyClicks = 0;
    window.__practiceKeyAudioBlocked = false;
    const parameter = () => ({
      setValueAtTime() {},
      exponentialRampToValueAtTime() {},
      linearRampToValueAtTime() {},
    });
    class SilentAudioContext {
      constructor() {
        if (window.__practiceKeyAudioBlocked) throw new DOMException("Simulated blocked audio", "NotAllowedError");
      }
      state = "running";
      destination = {};
      sampleRate = 48_000;
      get currentTime() { return performance.now() / 1000; }
      resume() { return Promise.resolve(); }
      close() { this.state = "closed"; return Promise.resolve(); }
      createGain() {
        return { gain: parameter(), connect() {}, disconnect() {} };
      }
      createBuffer(channels: number, length: number, sampleRate: number) {
        const data = Array.from({ length: channels }, () => new Float32Array(length));
        return { length, sampleRate, getChannelData: (channel: number) => data[channel] };
      }
      createBufferSource() {
        return { buffer: null, connect() {}, disconnect() {}, start() {}, stop() {} };
      }
      createBiquadFilter() {
        return { type: "lowpass", frequency: parameter(), connect() {}, disconnect() {} };
      }
      createOscillator() {
        return {
          type: "sine", frequency: parameter(), onended: null,
          connect() {}, disconnect() {}, stop() {},
          start() { window.__practiceKeyClicks++; },
        };
      }
    }
    Object.defineProperty(window, "AudioContext", {
      configurable: true, value: SilentAudioContext,
    });
    class Utterance extends EventTarget {
      text: string;
      lang = "";
      volume = 1;
      rate = 1;
      pitch = 1;
      voice: SpeechSynthesisVoice | null = null;
      onstart: ((event: Event) => void) | null = null;
      onend: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      constructor(text = "") {
        super();
        this.text = text;
      }
    }
    const japaneseVoice = {
      voiceURI: "test-ja-local",
      name: "Japanese local test voice",
      lang: "ja-JP",
      localService: true,
      default: false,
    } as SpeechSynthesisVoice;
    const entries: {
      utterance: Utterance;
      callbacks: Record<"start" | "end" | "error", ((event: Event) => void) | null>;
    }[] = [];
    let voices = japaneseAvailable ? [japaneseVoice] : [];
    const synthesis = Object.assign(new EventTarget(), {
      getVoices: () => voices,
      speaking: false,
      pending: false,
      paused: false,
      cancel: () => {
        window.__practiceSpeech.cancellations++;
        window.__practiceSpeech.active = null;
        synthesis.speaking = false;
      },
      pause: () => { synthesis.paused = true; },
      resume: () => { synthesis.paused = false; },
      speak: (utterance: Utterance) => {
        const index = entries.length;
        // Preserve callbacks to reproduce browsers delivering events after cancel().
        entries.push({ utterance, callbacks: {
          start: utterance.onstart,
          end: utterance.onend,
          error: utterance.onerror,
        } });
        window.__practiceSpeech.calls.push({
          text: utterance.text,
          lang: utterance.lang,
          volume: utterance.volume,
          rate: utterance.rate,
          pitch: utterance.pitch,
          voiceURI: utterance.voice?.voiceURI ?? null,
        });
        window.__practiceSpeech.active = index;
        synthesis.speaking = true;
        queueMicrotask(() => window.__practiceSpeech.emit(index, "start"));
      },
    });
    window.__practiceSpeech = {
      calls: [],
      cancellations: 0,
      active: null,
      emit(index, type) {
        const entry = entries[index];
        if (!entry) throw new Error(`No speech call at index ${index}`);
        if (type !== "start" && this.active === index) {
          this.active = null;
          synthesis.speaking = false;
        }
        const event = new Event(type);
        Object.defineProperty(event, "error", { value: "synthesis-failed" });
        entry.callbacks[type]?.call(entry.utterance, event);
        entry.utterance.dispatchEvent(event);
      },
      setJapaneseAvailable(available) {
        voices = available ? [japaneseVoice] : [];
        synthesis.dispatchEvent(new Event("voiceschanged"));
      },
    };
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true, value: Utterance,
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true, value: synthesis,
    });
  }, { japaneseAvailable });
}

async function startArticle(
  page: Page,
  segments = false,
  practiceMode: "逐句练习" | "分组练习" | "整篇练习" = "逐句练习",
) {
  await page.goto(`/zh-CN/articles/?id=${article.id}`);
  await page.getByRole("radio", { name: practiceMode, exact: true }).check();
  await page.getByRole("button", { name: "开始文章练习" }).click();
  if (!segments) await page.getByRole("checkbox", { name: "分段朗读", exact: true }).uncheck();
}
async function completeItem(page: Page) {
  await expect(page.getByLabel("输入进度")).toBeVisible();
  const remaining = (await page.getByLabel("输入进度")
    .locator("[data-romaji-pending]").allTextContents()).join("");
  expect(remaining.length).toBeGreaterThan(0);
  await page.keyboard.type(remaining);
  return remaining.length;
}
async function emit(page: Page, index: number, type: "end" | "error") {
  await page.evaluate(({ index, type }) => window.__practiceSpeech.emit(index, type), { index, type });
}
async function speechCalls(page: Page) {
  return page.evaluate(() => window.__practiceSpeech.calls);
}
async function records(page: Page): Promise<PracticeRecord[]> {
  return page.evaluate(() => new Promise<PracticeRecord[]>((resolve, reject) => {
    const request = indexedDB.open("pokotype-v1", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const read = database.transaction("records").objectStore("records").getAll();
      read.onerror = () => { database.close(); reject(read.error); };
      read.onsuccess = () => {
        database.close();
        resolve(read.result.map((entry) => entry.value));
      };
    };
  }));
}

for (const mode of ["整篇练习", "分组练习"] as const) {
  test(`${mode}默认分段朗读完成片段才说日文，发音期间计时和跨句跨组输入继续`, async ({ page }) => {
    await page.clock.install();
    await mockSpeech(page);
    await startArticle(page, true, mode);
    await expect(page.getByRole("checkbox", { name: "整句听读", exact: true })).not.toBeChecked();
    await page.keyboard.type("wata");
    expect(await speechCalls(page)).toEqual([]);
    await page.keyboard.type("q");
    expect(await speechCalls(page)).toEqual([]);
    await page.keyboard.type("siha");
    await expect.poll(async () => (await speechCalls(page)).length).toBe(1);
    await expect(page.getByRole("checkbox", { name: "分段朗读", exact: true })).toBeChecked();
    expect((await speechCalls(page))[0]).toMatchObject({ text: "私は", lang: "ja-JP", voiceURI: "test-ja-local" });
    expect(await page.evaluate(() => window.__practiceSpeech.active)).toBe(0);
    await page.clock.fastForward(2_000);
    const timer = page.getByLabel("练习统计").locator(":scope > span").first();
    await expect(timer).toHaveText("2 秒");

    const second = (await page.getByLabel("输入进度").locator("[data-romaji-pending]").allTextContents()).find(Boolean)!;
    await page.keyboard.type(second);
    expect(await speechCalls(page)).toHaveLength(2);
    expect(await page.evaluate(() => window.__practiceSpeech.active)).toBe(1);
    await emit(page, 0, "end");
    await emit(page, 0, "error");
    expect(await page.evaluate(() => window.__practiceSpeech.active)).toBe(1);
    let correct = "watasiha".length + second.length;
    correct += await completeItem(page);
    const current = page.getByTestId("article-passage").locator('[data-sentence-index][aria-current="step"]');
    await expect(current).toHaveAttribute("data-sentence-index", "1");
    expect((await speechCalls(page))[2]).toMatchObject({ text: article.sentences[0].segments.at(-1)!.text, lang: "ja-JP" });
    await expect(page.getByText(listening, { exact: true })).toHaveCount(0);
    await page.clock.fastForward(2_000);
    await expect(timer).toHaveText("4 秒");

    for (let index = 1; index < 3; index++) correct += await completeItem(page);
    await expect(current).toHaveAttribute("data-sentence-index", "3");
    if (mode === "分组练习") await expect(page.getByTestId("article-passage").locator("[data-sentence-index]")).toHaveCount(1);
    expect(await page.evaluate(() => window.__practiceSpeech.active)).toBe(8);
    await page.clock.fastForward(2_000);
    await expect(timer).toHaveText("6 秒");
    correct += await completeItem(page);
    await expect(page.getByRole("heading", { name: "又向前了一小步", exact: true })).toBeVisible();
    expect((await speechCalls(page)).map(({ text, lang }) => ({ text, lang }))).toEqual(
      article.sentences.flatMap((sentence) => sentence.segments.map(({ text }) => ({ text, lang: "ja-JP" }))),
    );
    expect(await page.evaluate(() => window.__practiceSpeech.active)).toBe(11);
    await emit(page, 8, "end");
    await emit(page, 11, "end");
    await expect.poll(async () => (await records(page)).length).toBe(1);
    const saved = await records(page);
    expect(saved).toMatchObject([{ correct, errors: 1 }]);
    expect(saved[0].durationMs).toBeGreaterThanOrEqual(6_000);
  });

  test(`${mode}分段朗读局部关闭、暂停及退出停声，迟到回调不重播且不修改全局偏好`, async ({ page }) => {
    await mockSpeech(page);
    await startArticle(page, true, mode);
    const globalPreferences = await page.evaluate(() => localStorage.getItem("pokotype:preferences:v1"));
    const segment = page.getByRole("checkbox", { name: "分段朗读", exact: true });
    await page.keyboard.type("watasiha");
    await expect.poll(async () => (await speechCalls(page)).length).toBe(1);
    const cancelled = await page.evaluate(() => window.__practiceSpeech.cancellations);
    await segment.uncheck();
    expect(await page.evaluate(() => window.__practiceSpeech.active)).toBeNull();
    expect(await page.evaluate(() => window.__practiceSpeech.cancellations)).toBeGreaterThan(cancelled);
    const second = (await page.getByLabel("输入进度").locator("[data-romaji-pending]").allTextContents()).find(Boolean)!;
    await page.keyboard.type(second);
    expect(await speechCalls(page)).toHaveLength(1);
    await segment.check();
    await completeItem(page);
    expect((await speechCalls(page))[1].text).toBe(article.sentences[0].segments.at(-1)!.text);
    await page.keyboard.press("Escape");
    expect(await page.evaluate(() => window.__practiceSpeech.active)).toBeNull();
    await emit(page, 1, "end");
    await emit(page, 1, "error");
    await page.getByRole("button", { name: "继续练习", exact: true }).click();
    expect(await speechCalls(page)).toHaveLength(2);
    await expect(page.getByTestId("article-passage").locator('[data-sentence-index][aria-current="step"]')).toHaveAttribute("data-sentence-index", "1");
    const next = (await page.getByLabel("输入进度").locator("[data-romaji-pending]").allTextContents()).find(Boolean)!;
    await page.keyboard.type(next);
    expect(await page.evaluate(() => window.__practiceSpeech.active)).toBe(2);
    await page.getByRole("button", { name: "结束练习", exact: true }).click();
    expect(await page.evaluate(() => window.__practiceSpeech.active)).toBeNull();
    await emit(page, 2, "end");
    await expect(page.getByRole("button", { name: "开始文章练习", exact: true })).toBeVisible();
    expect(await records(page)).toEqual([]);
    expect(await page.evaluate(() => localStorage.getItem("pokotype:preferences:v1"))).toBe(globalPreferences);
    await page.getByRole("button", { name: "开始文章练习", exact: true }).click();
    await expect(segment).toBeChecked();
    expect(await speechCalls(page)).toHaveLength(3);
  });
}

test("连续模式沿用全局关闭的分段朗读，手动开启仅对本轮生效", async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("pokotype:preferences:v1")) {
      localStorage.setItem("pokotype:preferences:v1", JSON.stringify({
        version: 1, value: { articleSegmentSpeechEnabled: false, articleSpeechEnabled: true },
      }));
    }
  });
  await mockSpeech(page);
  for (const mode of ["整篇练习", "分组练习"] as const) {
    await startArticle(page, true, mode);
    const segment = page.getByRole("checkbox", { name: "分段朗读", exact: true });
    await expect(segment).not.toBeChecked();
    await expect(page.getByRole("checkbox", { name: "整句听读", exact: true })).not.toBeChecked();
    await page.keyboard.type("watasiha");
    expect(await speechCalls(page)).toEqual([]);
    await segment.check();
    const second = (await page.getByLabel("输入进度").locator("[data-romaji-pending]").allTextContents()).find(Boolean)!;
    await page.keyboard.type(second);
    expect((await speechCalls(page))[0]).toMatchObject({ text: article.sentences[0].segments[1].text, lang: "ja-JP" });
    await page.getByRole("button", { name: "结束练习", exact: true }).click();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pokotype:preferences:v1")!).value))
      .toMatchObject({ articleSegmentSpeechEnabled: false, articleSpeechEnabled: true });
    await page.getByRole("button", { name: "开始文章练习", exact: true }).click();
    await expect(segment).not.toBeChecked();
    expect(await page.evaluate(() => window.__practiceSpeech.active)).toBeNull();
    await page.getByRole("button", { name: "结束练习", exact: true }).click();
  }
});

test("中间分段完成才发音，连续输入覆盖旧发音，最后优先朗读整句", async ({ page }) => {
  await mockSpeech(page);
  await startArticle(page, true);
  await expect(page.getByRole("checkbox", { name: "分段朗读", exact: true })).toBeChecked();
  const segments = article.sentences[0].segments;
  for (let index = 0; index < segments.length; index++) {
    const pending = await page.getByLabel("输入进度").locator("[data-romaji-pending]").allTextContents();
    const spelling = pending.find(Boolean)!;
    await page.keyboard.type(spelling.slice(0, -1));
    expect(await speechCalls(page)).toHaveLength(index);
    await page.keyboard.type(spelling.slice(-1));
    await expect.poll(async () => (await speechCalls(page)).length).toBe(index + 1);
    expect((await speechCalls(page))[index]).toMatchObject({
      text: index === segments.length - 1 ? sentenceText(article.sentences[0]) : segments[index].text,
      pitch: 1.15,
    });
    expect(await page.evaluate(() => window.__practiceSpeech.active)).toBe(index);
    if (index < segments.length - 1) {
      await expect(page.getByText(listening, { exact: true })).toHaveCount(0);
      await page.keyboard.type("q");
      expect(await speechCalls(page)).toHaveLength(index + 1);
    }
  }
  await expect(page.getByText(listening, { exact: true })).toBeVisible();
  // Both an old segment end and an error must leave full-sentence listening intact.
  await emit(page, 0, "end");
  await emit(page, 1, "error");
  await expect(page.getByText(`1 / ${article.sentences.length}`, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__practiceSpeech.active)).toBe(2);
  await page.getByRole("checkbox", { name: "分段朗读", exact: true }).uncheck();
  expect(await page.evaluate(() => window.__practiceSpeech.active)).toBe(2);
  await emit(page, 2, "end");
  await expect(page.getByText(`2 / ${article.sentences.length}`, { exact: true })).toBeVisible();
});

test("分段与整句开关独立，暂停取消分段且恢复不重复，末段可单独发音", async ({ page }) => {
  await mockSpeech(page);
  await startArticle(page, true);
  await page.keyboard.type("watashiha");
  expect((await speechCalls(page))[0].text).toBe("私は");
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => window.__practiceSpeech.active)).toBeNull();
  await emit(page, 0, "end");
  await page.getByRole("button", { name: "继续练习" }).click();
  await page.getByRole("checkbox", { name: "分段朗读", exact: true }).uncheck();
  await page.getByRole("checkbox", { name: "整句听读", exact: true }).uncheck();
  const second = (await page.getByLabel("输入进度").locator("[data-romaji-pending]").allTextContents()).find(Boolean)!;
  await page.keyboard.type(second);
  expect(await speechCalls(page)).toHaveLength(1);
  await page.getByRole("checkbox", { name: "分段朗读", exact: true }).check();
  await completeItem(page);
  await expect(page.getByText(`2 / ${article.sentences.length}`, { exact: true })).toBeVisible();
  expect((await speechCalls(page)).map((call) => call.text)).toEqual([
    "私は", article.sentences[0].segments.at(-1)!.text,
  ]);
  await expect(page.getByText(listening, { exact: true })).toHaveCount(0);
  await page.getByRole("checkbox", { name: "分段朗读", exact: true }).uncheck();
  expect(await page.evaluate(() => window.__practiceSpeech.active)).toBeNull();
  await page.reload();
  await page.getByRole("radio", { name: "逐句练习", exact: true }).check();
  await page.getByRole("button", { name: "开始文章练习" }).click();
  await expect(page.getByRole("checkbox", { name: "分段朗读", exact: true })).not.toBeChecked();
});

test("文章读完整原文，听读期间冻结输入，结束与过期回调只推进一次", async ({ page }) => {
  await mockSpeech(page);
  await page.addInitScript(() => localStorage.setItem("pokotype:preferences:v1", JSON.stringify({
    version: 1, value: { speechVolume: 0.4, speechRate: 0.8 },
  })));
  await page.clock.install();
  await startArticle(page);
  let correct = 0;
  for (let index = 0; index < article.sentences.length; index++) {
    correct += await completeItem(page);
    await expect(page.getByText(listening, { exact: true })).toBeVisible();
    await expect(page.getByText(`${index + 1} / ${article.sentences.length}`, { exact: true })).toBeVisible();
    expect((await speechCalls(page))[index]).toEqual({
      text: sentenceText(article.sentences[index]),
      lang: "ja-JP", volume: 0.4, rate: 0.8, pitch: 1.15, voiceURI: "test-ja-local",
    });
    for (const segment of article.sentences[index].segments) {
      await expect(page.locator("ruby").filter({ hasText: segment.text }).first()).toBeVisible();
    }
    const progress = await page.getByLabel("输入进度").textContent();
    const stats = await page.getByLabel("练习统计").textContent();
    const clicks = await page.evaluate(() => window.__practiceKeyClicks);
    expect(clicks).toBeGreaterThan(0);
    await page.keyboard.type("qqqqabc");
    await page.clock.fastForward(2_000);
    await expect(page.getByLabel("输入进度")).toHaveText(progress!);
    await expect(page.getByLabel("练习统计")).toHaveText(stats!);
    expect(await page.evaluate(() => window.__practiceKeyClicks)).toBe(clicks);
    await emit(page, index, "end");
    await emit(page, index, "end");
    await emit(page, index, "error");
    if (index < article.sentences.length - 1) {
      await expect(page.getByText(`${index + 2} / ${article.sentences.length}`, { exact: true })).toBeVisible();
      await expect(page.getByText(listening, { exact: true })).toHaveCount(0);
    }
  }
  await expect(page.getByRole("heading", { name: "又向前了一小步" })).toBeVisible();
  await expect.poll(async () => (await records(page)).length).toBe(1);
  expect(await records(page)).toMatchObject([{ correct, errors: 0, mode: "article" }]);
  expect(await speechCalls(page)).toHaveLength(article.sentences.length);
});

test("Enter 跳过及关闭整句听读会停止发音，晚到的回调不影响下一句", async ({ page }) => {
  await mockSpeech(page);
  await startArticle(page);
  await completeItem(page);
  const before = await page.evaluate(() => window.__practiceSpeech.cancellations);
  await page.keyboard.press("Enter");
  await expect(page.getByText(`2 / ${article.sentences.length}`, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__practiceSpeech.cancellations)).toBeGreaterThan(before);
  await emit(page, 0, "end");
  await completeItem(page);
  await expect(page.getByText(listening, { exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: "整句听读", exact: true }).uncheck();
  await expect(page.getByText(`3 / ${article.sentences.length}`, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__practiceSpeech.active)).toBeNull();
  await emit(page, 1, "end");
  for (let index = 2; index < article.sentences.length; index++) await completeItem(page);
  await expect(page.getByRole("heading", { name: "又向前了一小步" })).toBeVisible();
  expect(await speechCalls(page)).toHaveLength(2);
  await expect.poll(async () => (await records(page)).length).toBe(1);
});

test("听读暂停会取消声音，继续重读原句，暂停中也可跳过", async ({ page }) => {
  await mockSpeech(page);
  await startArticle(page);
  await completeItem(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "继续练习" })).toBeVisible();
  expect(await page.evaluate(() => window.__practiceSpeech.active)).toBeNull();
  await emit(page, 0, "end");
  await expect(page.getByText(`1 / ${article.sentences.length}`, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "继续练习" }).click();
  await expect.poll(async () => (await speechCalls(page)).length).toBe(2);
  expect((await speechCalls(page)).map((call) => call.text)).toEqual([
    sentenceText(article.sentences[0]), sentenceText(article.sentences[0]),
  ]);
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  await page.getByRole("button", { name: "跳过朗读", exact: true }).click();
  await expect(page.getByText(`2 / ${article.sentences.length}`, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "继续练习" })).toBeVisible();
  await emit(page, 1, "end");
  await expect(page.getByText(`2 / ${article.sentences.length}`, { exact: true })).toBeVisible();
});

for (const cause of ["blur", "hidden"] as const) {
  test(`听读时 ${cause} 自动暂停并清理，退出后晚到事件无效`, async ({ page }) => {
    await mockSpeech(page);
    await startArticle(page);
    await completeItem(page);
    await page.evaluate((cause) => {
      if (cause === "blur") window.dispatchEvent(new Event("blur"));
      else {
        Object.defineProperty(document, "hidden", { configurable: true, value: true });
        document.dispatchEvent(new Event("visibilitychange"));
        Object.defineProperty(document, "hidden", { configurable: true, value: false });
      }
    }, cause);
    await expect(page.getByRole("button", { name: "继续练习" })).toBeVisible();
    expect(await page.evaluate(() => window.__practiceSpeech.active)).toBeNull();
    await page.getByRole("button", { name: "继续练习" }).click();
    await expect.poll(async () => (await speechCalls(page)).length).toBe(2);
    await page.getByRole("button", { name: "结束练习", exact: true }).click();
    expect(await page.evaluate(() => window.__practiceSpeech.active)).toBeNull();
    await emit(page, 0, "end");
    await emit(page, 1, "error");
    await expect(page.getByRole("button", { name: "开始文章练习" })).toBeVisible();
    expect(await records(page)).toEqual([]);
  });
}

test("浏览器没有语音 API 时文章照常完成", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: undefined });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: undefined });
  });
  await startArticle(page);
  for (let index = 0; index < article.sentences.length; index++) {
    await expect(page.getByText(`${index + 1} / ${article.sentences.length}`, { exact: true })).toBeVisible();
    await completeItem(page);
  }
  await expect(page.getByRole("heading", { name: "又向前了一小步" })).toBeVisible();
  await expect.poll(async () => (await records(page)).length).toBe(1);
});

test("假名读显示字符且最新题覆盖旧发音，最后一题发音保留到结果页", async ({ page }) => {
  await mockSpeech(page);
  await page.goto("/zh-CN/");
  await page.getByRole("button", { name: /片假名/ }).click();
  await page.getByRole("button", { name: "开始练习 20 题" }).click();
  await expect(page.getByLabel("输入进度")).toBeVisible();
  const texts: string[] = [];
  for (let index = 0; index < 20; index++) {
    texts.push((await page.locator('div[lang="ja"]').textContent())!);
    await completeItem(page);
    await expect.poll(async () => (await speechCalls(page)).length).toBe(index + 1);
    expect(await page.evaluate(() => window.__practiceSpeech.active)).toBe(index);
    if (index > 0) {
      await emit(page, index - 1, "end");
      expect(await page.evaluate(() => window.__practiceSpeech.active)).toBe(index);
    }
  }
  await expect(page.getByRole("heading", { name: "又向前了一小步" })).toBeVisible();
  expect((await speechCalls(page)).map((call) => call.text)).toEqual(texts);
  expect(texts.every((text) => /^[\u30a0-\u30ff]+$/.test(text))).toBe(true);
  expect(await page.evaluate(() => window.__practiceSpeech.active)).toBe(19);
  await emit(page, 19, "end");
  await expect.poll(async () => (await records(page)).length).toBe(1);
  await page.getByRole("button", { name: "返回练习设置" }).click();
  expect(await page.evaluate(() => window.__practiceSpeech.active)).toBeNull();
});

test("关闭假名发音后仅推进题目，不创建朗读", async ({ page }) => {
  await mockSpeech(page);
  await page.goto("/zh-CN/");
  await page.getByRole("button", { name: "开始练习 20 题" }).click();
  await page.getByRole("checkbox", { name: "完成后发音", exact: true }).uncheck();
  await page.getByRole("checkbox", { name: "按键音效", exact: true }).uncheck();
  await completeItem(page);
  await expect(page.getByText("2 / 20", { exact: true })).toBeVisible();
  expect(await speechCalls(page)).toEqual([]);
  expect(await page.evaluate(() => window.__practiceKeyClicks)).toBe(0);
});

test("发音失败自动推进，最后一句 Enter 跳过后只保存一次结果", async ({ page }) => {
  await mockSpeech(page);
  await startArticle(page);
  for (let index = 0; index < article.sentences.length; index++) {
    await completeItem(page);
    await expect(page.getByText(listening, { exact: true })).toBeVisible();
    if (index === article.sentences.length - 1) await page.keyboard.press("Enter");
    else {
      await emit(page, index, "error");
      await expect(page.getByText(`${index + 2} / ${article.sentences.length}`, { exact: true })).toBeVisible();
    }
  }
  await expect(page.getByRole("heading", { name: "又向前了一小步" })).toBeVisible();
  await emit(page, article.sentences.length - 1, "end");
  await expect.poll(async () => (await records(page)).length).toBe(1);
});

test("尚无日语音色时继续练习，音色到达后下一句可以朗读", async ({ page }) => {
  await mockSpeech(page, false);
  await startArticle(page);
  await completeItem(page);
  await expect(page.getByText(`2 / ${article.sentences.length}`, { exact: true })).toBeVisible();
  expect(await speechCalls(page)).toEqual([]);
  await page.evaluate(() => window.__practiceSpeech.setJapaneseAvailable(true));
  await completeItem(page);
  await expect(page.getByText(listening, { exact: true })).toBeVisible();
  expect((await speechCalls(page))[0].text).toBe(sentenceText(article.sentences[1]));
  await expect(page.getByText(/未找到日语语音/)).toHaveCount(0);
});


test("匹配与错键都有按键音，修饰键、输入法、重复键和暂停输入不播放", async ({ page }) => {
  await mockSpeech(page);
  await startArticle(page);
  await page.keyboard.type("qw");
  await expect(page.getByText("按键音效暂时无法播放。", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.__practiceKeyClicks)).toBe(2);
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Meta+a");
  await page.keyboard.press("Alt+a");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Backspace");
  await page.evaluate(() => {
    for (const options of [{ repeat: true }, { isComposing: true }]) {
      document.dispatchEvent(new KeyboardEvent("keydown", {
        key: "a", bubbles: true, ...options,
      }));
    }
  });
  expect(await page.evaluate(() => window.__practiceKeyClicks)).toBe(2);
  await page.keyboard.press("Escape");
  await page.keyboard.type("atashi");
  expect(await page.evaluate(() => window.__practiceKeyClicks)).toBe(2);
  await page.getByRole("button", { name: "继续练习" }).click();
  await page.getByRole("checkbox", { name: "按键音效", exact: true }).uncheck();
  await page.keyboard.type("a");
  expect(await page.evaluate(() => window.__practiceKeyClicks)).toBe(2);
});

test("五十音会话浏览器返回立即停止声音，迟到回调与前进不会恢复旧练习", async ({ page, baseURL }) => {
  await mockSpeech(page);
  await page.goto("/zh-CN/");
  await page.getByRole("button", { name: "开始练习 20 题", exact: true }).click();
  await expect(page).toHaveURL(/\/practice\/\?session=[0-9a-f-]+$/);
  await completeItem(page);
  await expect.poll(async () => (await speechCalls(page)).length).toBe(1);
  expect(await page.evaluate(() => window.__practiceSpeech.active)).toBe(0);
  const cancellations = await page.evaluate(() => window.__practiceSpeech.cancellations);
  await page.goBack();
  await expect(page).toHaveURL(new URL("/zh-CN/", baseURL).href);
  await expect(page.getByRole("button", { name: "开始练习 20 题", exact: true })).toBeFocused();
  expect(await page.evaluate(() => window.__practiceSpeech.active)).toBeNull();
  expect(await page.evaluate(() => window.__practiceSpeech.cancellations)).toBeGreaterThan(cancellations);
  await emit(page, 0, "end");
  await emit(page, 0, "error");
  await page.goForward();
  await expect(page).toHaveURL(new URL("/zh-CN/", baseURL).href);
  await expect(page.getByLabel("输入进度")).toHaveCount(0);
  expect(await records(page)).toEqual([]);
  expect(await speechCalls(page)).toHaveLength(1);
});


test("按键音失败提示不被朗读提示覆盖，重试后恢复按键音", async ({ page }) => {
  await mockSpeech(page, false);
  await startArticle(page);
  await page.evaluate(() => { window.__practiceKeyAudioBlocked = true; });
  await page.keyboard.type("q");
  const retry = page.getByRole("button", { name: "重试按键音", exact: true });
  await expect(retry).toBeVisible();
  expect(await page.evaluate(() => window.__practiceKeyClicks)).toBe(0);
  await completeItem(page);
  await expect(page.getByText(/未找到日语语音/)).toBeVisible();
  await expect(retry).toBeVisible();
  await page.evaluate(() => { window.__practiceKeyAudioBlocked = false; });
  await retry.click();
  await expect(retry).not.toBeVisible();
  await expect(page.getByText(/未找到日语语音/)).toBeVisible();
  const before = await page.evaluate(() => window.__practiceKeyClicks);
  await page.keyboard.type("q");
  await expect.poll(() => page.evaluate(() => window.__practiceKeyClicks)).toBe(before + 1);
});

test("文章预览播放完整日语正文，沿用声音偏好且不受自动朗读开关影响", async ({ page }) => {
  await mockSpeech(page);
  await page.addInitScript(() => localStorage.setItem("pokotype:preferences:v1", JSON.stringify({
    version: 1, value: {
      articleSpeechEnabled: false, articleSegmentSpeechEnabled: false,
      speechVoiceURI: "test-ja-local", speechVolume: 0.4, speechRate: 0.8, speechPitch: 1,
    },
  })));
  await page.goto(`/zh-CN/articles/?id=${article.id}`);
  const play = page.getByRole("button", { name: "播放文章", exact: true });
  await expect(play).toHaveAttribute("title", "播放文章");
  await expect(play).toHaveAttribute("aria-pressed", "false");
  await expect(play).toHaveText("");
  await play.click();
  const stop = page.getByRole("button", { name: "停止播放", exact: true });
  await expect(stop).toHaveAttribute("title", "停止播放");
  await expect(stop).toHaveAttribute("aria-pressed", "true");
  await expect(stop).toHaveText("");
  expect(await speechCalls(page)).toEqual([{
    text: article.sentences.map(sentenceText).join("\n"),
    lang: "ja-JP", volume: 0.4, rate: 0.8, pitch: 1, voiceURI: "test-ja-local",
  }]);
  await emit(page, 0, "end");
  await expect(play).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("article-preview-passage")).toBeVisible();
  expect(await records(page)).toEqual([]);
});

test("文章预览重复点击停止，旧回调不影响重播，结束与失败后可以再播放", async ({ page }) => {
  await mockSpeech(page);
  await page.goto(`/zh-CN/articles/?id=${article.id}`);
  const play = page.getByRole("button", { name: "播放文章", exact: true });
  await play.click();
  const cancellations = await page.evaluate(() => window.__practiceSpeech.cancellations);
  await page.getByRole("button", { name: "停止播放", exact: true }).click();
  await expect(play).toHaveAttribute("aria-pressed", "false");
  expect(await page.evaluate(() => window.__practiceSpeech.active)).toBeNull();
  expect(await page.evaluate(() => window.__practiceSpeech.cancellations)).toBeGreaterThan(cancellations);
  await play.click();
  await emit(page, 0, "end");
  await emit(page, 0, "error");
  await expect(page.getByRole("button", { name: "停止播放", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => window.__practiceSpeech.active)).toBe(1);
  await emit(page, 1, "error");
  await expect(play).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("日语朗读暂时无法播放，可继续打字练习。", { exact: true })).toBeVisible();
  await play.click();
  await expect(page.getByText("日语朗读暂时无法播放，可继续打字练习。", { exact: true })).toHaveCount(0);
  await emit(page, 1, "end");
  await expect(page.getByRole("button", { name: "停止播放", exact: true })).toHaveAttribute("aria-pressed", "true");
  await emit(page, 2, "end");
  await expect(play).toHaveAttribute("aria-pressed", "false");
  expect(await speechCalls(page)).toHaveLength(3);
});

test("文章预览修改读音和开始练习都会停止播放，晚到事件不恢复预览声音", async ({ page }) => {
  await mockSpeech(page);
  await page.goto(`/zh-CN/articles/?id=${article.id}`);
  const play = page.getByRole("button", { name: "播放文章", exact: true });
  await play.click();
  await page.getByRole("button", { name: "修改标题与读音", exact: true }).click();
  await expect(page.getByLabel("文章标题", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__practiceSpeech.active)).toBeNull();
  await emit(page, 0, "end");
  await emit(page, 0, "error");
  await page.getByRole("button", { name: "取消修改", exact: true }).click();
  await expect(play).toHaveAttribute("aria-pressed", "false");
  await play.click();
  await page.getByRole("button", { name: "开始文章练习", exact: true }).click();
  await expect(page.getByLabel("输入进度")).toBeVisible();
  expect(await page.evaluate(() => window.__practiceSpeech.active)).toBeNull();
  await emit(page, 1, "end");
  await emit(page, 1, "error");
  await expect(page.getByLabel("输入进度")).toBeVisible();
  await expect(page.getByText(listening, { exact: true })).toHaveCount(0);
  expect(await speechCalls(page)).toHaveLength(2);
});

test("文章预览页面隐藏、pagehide 和路由离开均停止声音，返回后需要手动播放", async ({ page }) => {
  await mockSpeech(page);
  await page.goto(`/zh-CN/articles/?id=${article.id}`);
  const play = page.getByRole("button", { name: "播放文章", exact: true });
  for (const [index, cause] of ["hidden", "pagehide"].entries()) {
    await play.click();
    await page.evaluate((cause) => {
      if (cause === "hidden") {
        Object.defineProperty(document, "hidden", { configurable: true, value: true });
        document.dispatchEvent(new Event("visibilitychange"));
        Object.defineProperty(document, "hidden", { configurable: true, value: false });
      } else window.dispatchEvent(new Event("pagehide"));
    }, cause);
    await expect(play).toHaveAttribute("aria-pressed", "false");
    expect(await page.evaluate(() => window.__practiceSpeech.active)).toBeNull();
    await emit(page, index, "end");
    await emit(page, index, "error");
    await expect(play).toHaveAttribute("aria-pressed", "false");
  }
  await play.click();
  const cancellations = await page.evaluate(() => window.__practiceSpeech.cancellations);
  await page.getByRole("navigation", { name: "主导航" }).getByRole("link", { name: "设置", exact: true }).click();
  await expect(page).toHaveURL(/\/zh-CN\/settings\/$/);
  expect(await page.evaluate(() => window.__practiceSpeech.active)).toBeNull();
  expect(await page.evaluate(() => window.__practiceSpeech.cancellations)).toBeGreaterThan(cancellations);
  await emit(page, 2, "end");
  await emit(page, 2, "error");
  await page.goBack();
  await expect(play).toHaveAttribute("aria-pressed", "false");
  expect(await speechCalls(page)).toHaveLength(3);
});

test("文章预览缺少日语音色时显示提示，音色到达后可重试播放", async ({ page }) => {
  await mockSpeech(page, false);
  await page.goto(`/zh-CN/articles/?id=${article.id}`);
  const play = page.getByRole("button", { name: "播放文章", exact: true });
  await play.click();
  await expect(page.getByText(/未找到日语语音/)).toBeVisible();
  await expect(play).toHaveAttribute("aria-pressed", "false");
  expect(await speechCalls(page)).toEqual([]);
  await page.evaluate(() => window.__practiceSpeech.setJapaneseAvailable(true));
  await play.click();
  await expect(page.getByText(/未找到日语语音/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "停止播放", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect((await speechCalls(page))[0].text).toBe(article.sentences.map(sentenceText).join("\n"));
  await emit(page, 0, "end");
  await expect(play).toHaveAttribute("aria-pressed", "false");
});

test("文章预览没有语音 API 时显示提示并恢复播放按钮，重试不阻塞操作", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: undefined });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: undefined });
  });
  await page.goto(`/zh-CN/articles/?id=${article.id}`);
  const play = page.getByRole("button", { name: "播放文章", exact: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    await play.click();
    await expect(page.getByText("当前浏览器不支持语音朗读，可继续打字练习。", { exact: true })).toBeVisible();
    await expect(play).toHaveAttribute("aria-pressed", "false");
    await expect(play).toBeEnabled();
  }
  await page.getByRole("button", { name: "修改标题与读音", exact: true }).click();
  await expect(page.getByLabel("文章标题", { exact: true })).toBeVisible();
});
