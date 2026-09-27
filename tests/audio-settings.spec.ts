import { expect, test, type Page } from "@playwright/test";

declare global {
  interface Window {
    __settingsAudio: {
      calls: { text: string; volume: number; rate: number; pitch: number; voiceURI: string }[];
      cancellations: number;
      keyStarts: number;
      updateVoices: () => void;
    };
  }
}

async function mockAudio(page: Page) {
  await page.addInitScript(() => {
    let voices: SpeechSynthesisVoice[] = [];
    const synthesis = Object.assign(new EventTarget(), {
      getVoices: () => voices,
      cancel: () => { window.__settingsAudio.cancellations++; },
      speak: (utterance: SpeechSynthesisUtterance) => {
        window.__settingsAudio.calls.push({
          text: utterance.text, volume: utterance.volume, rate: utterance.rate, pitch: utterance.pitch,
          voiceURI: utterance.voice?.voiceURI ?? "",
        });
        utterance.onstart?.(new Event("start") as SpeechSynthesisEvent);
      },
    });
    class Utterance {
      constructor(public text: string) {}
    }
    const parameter = () => ({ setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} });
    class Context {
      state = "running";
      currentTime = 0;
      sampleRate = 44100;
      destination = {};
      close = async () => {};
      createGain = () => ({ gain: parameter(), connect() {}, disconnect() {} });
      createBuffer = (_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) });
      createBufferSource = () => ({ connect() {}, disconnect() {}, start() {}, stop() {} });
      createBiquadFilter = () => ({ frequency: parameter(), connect() {}, disconnect() {} });
      createOscillator = () => ({
        frequency: parameter(), connect() {}, disconnect() {}, stop() {},
        start: () => { window.__settingsAudio.keyStarts++; },
      });
    }
    window.__settingsAudio = {
      calls: [], cancellations: 0, keyStarts: 0,
      updateVoices() {
        voices = [
          { voiceURI: "ja-local", name: "日语本地测试", lang: "ja-JP", localService: true },
          { voiceURI: "ja-online", name: "日语在线测试", lang: "ja-JP", localService: false },
          { voiceURI: "ja-kyoko", name: "Kyoko", lang: "ja-JP", localService: true },
          { voiceURI: "en-local", name: "English test", lang: "en-US", localService: true },
        ] as SpeechSynthesisVoice[];
        synthesis.dispatchEvent(new Event("voiceschanged"));
      },
    };
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: synthesis });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: Utterance });
    Object.defineProperty(window, "AudioContext", { configurable: true, value: Context });
  });
}

test("旧偏好补齐声音默认值，开关和声音选项独立保存", async ({ page }) => {
  await mockAudio(page);
  await page.goto("/zh-CN/settings/");
  await page.evaluate(() => localStorage.setItem("pokotype:preferences:v1", JSON.stringify({
    version: 1, value: {
      showRomaji: false, showKana: false, showTranslation: true,
      script: "katakana", count: 50, groupIds: [],
    },
  })));
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "显示罗马音提示" })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "开启按键音", exact: true })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "五十音自动朗读", exact: true })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "文章逐句朗读", exact: true })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "文章分段朗读", exact: true })).toBeChecked();
  await expect(page.getByLabel("朗读音高", { exact: true })).toHaveValue("1.15");
  await page.getByRole("checkbox", { name: "开启按键音", exact: true }).uncheck();
  await page.getByRole("checkbox", { name: "文章逐句朗读", exact: true }).uncheck();
  await page.getByRole("checkbox", { name: "文章分段朗读", exact: true }).uncheck();
  await page.getByLabel("按键音量", { exact: true }).fill("0.4");
  await page.getByLabel("朗读音量", { exact: true }).fill("0.6");
  await page.getByLabel("朗读速度", { exact: true }).selectOption("0.8");
  await page.getByLabel("朗读音高", { exact: true }).selectOption("1");
  await page.evaluate(() => window.__settingsAudio.updateVoices());
  await page.getByLabel("日语音色", { exact: true }).selectOption("ja-online");
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "开启按键音", exact: true })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "五十音自动朗读", exact: true })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "文章逐句朗读", exact: true })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "文章分段朗读", exact: true })).not.toBeChecked();
  await expect(page.getByLabel("按键音量", { exact: true })).toHaveValue("0.4");
  await expect(page.getByLabel("朗读音量", { exact: true })).toHaveValue("0.6");
  await expect(page.getByLabel("朗读速度", { exact: true })).toHaveValue("0.8");
  await expect(page.getByLabel("朗读音高", { exact: true })).toHaveValue("1");
  await expect(page.getByLabel("日语音色", { exact: true })).toHaveValue("ja-online");
  await expect(page.getByText("已保存的音色在此设备不可用，将自动尝试其他日语音色。")).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pokotype:preferences:v1")!).value)).toMatchObject({
    script: "katakana", count: 50, groupIds: [], showRomaji: false,
  });
});

test("音色延迟加载，试听忽略练习开关且使用音量语速，离开和停用会停止播放", async ({ page }) => {
  await mockAudio(page);
  await page.goto("/zh-CN/settings/");
  await page.evaluate(() => window.__settingsAudio.updateVoices());
  const voice = page.getByLabel("日语音色", { exact: true });
  await expect(voice.locator("option")).toHaveText(["自动选择（日语）", "日语本地测试 · 本地", "日语在线测试 · 在线", "Kyoko · 本地"]);
  await page.getByRole("checkbox", { name: "开启按键音", exact: true }).uncheck();
  await page.getByRole("checkbox", { name: "五十音自动朗读", exact: true }).uncheck();
  await page.getByRole("checkbox", { name: "文章逐句朗读", exact: true }).uncheck();
  await page.getByLabel("朗读音量", { exact: true }).fill("0.4");
  await page.getByLabel("朗读速度", { exact: true }).selectOption("1.2");
  await voice.selectOption("ja-online");
  await page.getByRole("button", { name: "试听按键音", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__settingsAudio.keyStarts)).toBe(1);
  await page.getByRole("button", { name: "试听日语", exact: true }).click();
  expect(await page.evaluate(() => window.__settingsAudio.calls)).toEqual([{
    text: "こんにちは。日本語の練習を始めましょう。", volume: 0.4, rate: 1.2, pitch: 1.15, voiceURI: "ja-online",
  }]);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect.poll(() => page.evaluate(() => window.__settingsAudio.cancellations)).toBe(1);
  await page.getByRole("checkbox", { name: "五十音自动朗读", exact: true }).check();
  await page.getByRole("button", { name: "试听日语", exact: true }).click();
  await page.getByRole("checkbox", { name: "五十音自动朗读", exact: true }).uncheck();
  await expect.poll(() => page.evaluate(() => window.__settingsAudio.cancellations)).toBe(2);
  await page.getByLabel("按键音量", { exact: true }).fill("0");
  await page.getByRole("button", { name: "试听按键音", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__settingsAudio.keyStarts)).toBe(1);
  await page.getByLabel("朗读音量", { exact: true }).fill("0");
  await page.getByRole("button", { name: "试听日语", exact: true }).click();
  expect(await page.evaluate(() => window.__settingsAudio.calls.length)).toBe(2);
  await page.getByLabel("朗读音量", { exact: true }).fill("0.4");
  await page.getByRole("button", { name: "试听日语", exact: true }).click();
  await page.getByRole("navigation", { name: "主导航" }).getByRole("link", { name: "五十音练习", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__settingsAudio.cancellations)).toBe(3);
});

test("自动选择 Kyoko，音高可从轻快切换到自然并立即用于试听", async ({ page }) => {
  await mockAudio(page);
  await page.goto("/zh-CN/settings/");
  await page.evaluate(() => window.__settingsAudio.updateVoices());
  await page.getByRole("button", { name: "试听日语", exact: true }).click();
  expect(await page.evaluate(() => window.__settingsAudio.calls[0])).toMatchObject({ voiceURI: "ja-kyoko", pitch: 1.15, rate: 1 });
  await page.getByLabel("朗读音高", { exact: true }).selectOption("1");
  await expect.poll(() => page.evaluate(() => window.__settingsAudio.cancellations)).toBe(1);
  await page.getByRole("button", { name: "试听日语", exact: true }).click();
  expect(await page.evaluate(() => window.__settingsAudio.calls[1])).toMatchObject({ voiceURI: "ja-kyoko", pitch: 1, rate: 1 });
});

test("按键音开启但音量为零时给出提示，调高音量后恢复试听", async ({ page }) => {
  await mockAudio(page);
  await page.goto("/zh-CN/settings/");
  await expect(page.getByRole("checkbox", { name: "开启按键音", exact: true })).toBeChecked();
  const volume = page.getByLabel("按键音量", { exact: true });
  const hint = page.getByText("按键音量为 0，练习和试听均静音。向右调整滑块即可听到按键音。", { exact: true });
  await volume.fill("0");
  await expect(hint).toBeVisible();
  await page.getByRole("button", { name: "试听按键音", exact: true }).click();
  expect(await page.evaluate(() => window.__settingsAudio.keyStarts)).toBe(0);
  await volume.fill("0.4");
  await expect(hint).not.toBeVisible();
  await page.getByRole("button", { name: "试听按键音", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__settingsAudio.keyStarts)).toBe(1);
});
