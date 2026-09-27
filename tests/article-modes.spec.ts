import { expect, test, type Page } from "@playwright/test";
import { SAMPLE_ARTICLES, sentenceText, type Article } from "../src/lib/articles";
import type { PracticeRecord } from "../src/lib/storage";

const labels = { sentence: "逐句练习", group: "分组练习", full: "整篇练习" } as const;
const shortArticle: Article = {
  ...SAMPLE_ARTICLES[0],
  id: "test-article-modes",
  title: "多模式回归文章",
  source: "ai",
  sentences: [
    { segments: [{ text: "芯。", reading: "しん。" }], translation: "中心。" },
    { segments: [{ text: "朝。", reading: "あさ。" }], translation: "早晨。" },
    { segments: [{ text: "色。", reading: "いろ。" }], translation: "颜色。" },
    { segments: [{ text: "海。", reading: "うみ。" }], translation: "大海。" },
  ],
};
const spelling = "shinasairoumi";

async function seedArticle(page: Page, article = shortArticle) {
  await page.goto("/zh-CN/");
  await expect(page.getByRole("button", { name: "开始练习 20 题", exact: true })).toBeEnabled();
  await page.evaluate((article) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("pokotype-v1", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("articles", "readwrite");
      transaction.objectStore("articles").put({ id: article.id, version: 1, value: article });
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onabort = () => { database.close(); reject(transaction.error); };
    };
  }), article);
  await page.goto(`/zh-CN/articles/?id=${article.id}`);
  await expect(page.getByRole("button", { name: "开始文章练习", exact: true })).toBeEnabled();
}

async function records(page: Page): Promise<PracticeRecord[]> {
  return page.evaluate(() => new Promise<PracticeRecord[]>((resolve, reject) => {
    const request = indexedDB.open("pokotype-v1", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const read = database.transaction("records").objectStore("records").getAll();
      read.onerror = () => { database.close(); reject(read.error); };
      read.onsuccess = () => { database.close(); resolve(read.result.map((entry) => entry.value)); };
    };
  }));
}

async function start(page: Page, mode: keyof typeof labels) {
  await page.getByRole("radio", { name: labels[mode], exact: true }).check();
  await page.getByRole("button", { name: "开始文章练习", exact: true }).click();
  await expect(page.getByLabel("输入进度")).toBeVisible();
}

const passage = (page: Page) => page.getByTestId("article-passage");
const currentSentence = (page: Page) => passage(page).locator('[data-sentence-index][aria-current="step"]');
const timer = (page: Page) => page.getByLabel("练习统计").locator(":scope > span").first();

test("文章预览连成完整正文与独立译文，模式面板内唯一开始入口默认开启整篇练习", async ({ page }) => {
  const article = SAMPLE_ARTICLES[0];
  await page.goto(`/zh-CN/articles/?id=${article.id}`);
  const preview = page.getByTestId("article-preview-passage");
  const translation = page.getByTestId("article-preview-translation");
  await expect(preview).toHaveCount(1);
  await expect(translation).toHaveCount(1);
  await expect(preview.locator("ruby")).toHaveCount(article.sentences.flatMap((sentence) => sentence.segments).length);
  const content = await preview.evaluate((element) => {
    const text = element.cloneNode(true) as HTMLElement;
    text.querySelectorAll("rt").forEach((reading) => reading.remove());
    return {
      text: text.textContent?.replace(/\s/g, ""),
      sentenceDisplays: Array.from(element.children, (sentence) => getComputedStyle(sentence).display),
      includesTranslation: element.contains(document.querySelector('[data-testid="article-preview-translation"]')),
    };
  });
  expect(content.text).toBe(article.sentences.map(sentenceText).join(""));
  expect(content.sentenceDisplays).toEqual(article.sentences.map(() => "inline"));
  expect(content.includesTranslation).toBe(false);
  expect(await translation.evaluate((element) => element.textContent?.replace(/\s/g, "")))
    .toContain(article.sentences.map((sentence) => sentence.translation).join(""));
  await expect(preview.locator("..").getByText(/^0[1-4]$/)).toHaveCount(0);

  const modes = page.getByRole("group", { name: "选择练习方式", exact: true });
  await expect(modes.getByRole("radio", { name: "整篇练习", exact: true })).toBeChecked();
  const begin = modes.getByRole("button", { name: "开始文章练习", exact: true });
  await expect(page.getByRole("button", { name: "开始文章练习", exact: true })).toHaveCount(1);
  await expect(begin).toBeEnabled();
  expect(await begin.evaluate((button) => {
    const choices = button.closest("fieldset")!.querySelectorAll('input[type="radio"]');
    return Array.from(choices).every((choice) =>
      choice.closest("label")!.getBoundingClientRect().bottom <= button.getBoundingClientRect().top,
    );
  })).toBe(true);
  await begin.click();
  await expect(passage(page).locator("[data-sentence-index]")).toHaveCount(article.sentences.length);
  await expect(currentSentence(page)).toHaveAttribute("data-sentence-index", "0");
});

test("连贯预览仍可编辑标题与读音，保存副本及刷新后保留正文并可开练", async ({ page }) => {
  const article = SAMPLE_ARTICLES[0];
  await page.goto(`/zh-CN/articles/?id=${article.id}`);
  await page.getByRole("button", { name: "修改标题与读音", exact: true }).click();
  await expect(page.getByRole("button", { name: "开始文章练习", exact: true })).toBeDisabled();
  await page.getByLabel("文章标题", { exact: true }).fill("连贯预览保存副本");
  await page.getByLabel("第 1 句第 1 段读音", { exact: true }).fill("わたくしは");
  await page.getByRole("button", { name: "保存为副本", exact: true }).click();
  await expect(page.getByRole("heading", { name: "连贯预览保存副本", exact: true })).toBeVisible();
  await expect(page.getByTestId("article-preview-passage").locator("ruby rt").first()).toHaveText("わたくしは");
  await expect(page.getByTestId("article-preview-translation")).toContainText(article.sentences.at(-1)!.translation);
  await page.reload();
  await expect(page.getByRole("heading", { name: "连贯预览保存副本", exact: true })).toBeVisible();
  await expect(page.getByTestId("article-preview-passage").locator("ruby rt").first()).toHaveText("わたくしは");
  await page.getByRole("group", { name: "选择练习方式", exact: true })
    .getByRole("button", { name: "开始文章练习", exact: true }).click();
  await expect(passage(page).locator("[data-sentence-index]")).toHaveCount(article.sentences.length);
  await expect(page.getByLabel("输入进度")).toContainText("watakusiha");
});

test("连贯文章预览在窄桌面和手机正常阅读，无横向溢出且手机隐藏开始练习入口", async ({ page }) => {
  for (const width of [800, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`/zh-CN/articles/?id=${SAMPLE_ARTICLES[0].id}`);
    await expect(page.getByTestId("article-preview-passage")).toBeVisible();
    await expect(page.getByTestId("article-preview-translation")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const id of ["article-preview-passage", "article-preview-translation"]) {
      expect(await page.getByTestId(id).evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    }
    const begin = page.getByRole("button", { name: "开始文章练习", exact: true });
    if (width === 390) await expect(begin).not.toBeVisible();
    else await expect(begin).toBeVisible();
    await expect(page.getByRole("button", { name: "修改标题与读音", exact: true })).toBeVisible();
  }
});

test("连贯文章预览沿用显示偏好，隐藏假名与译文后不残留读音或翻译区域", async ({ page }) => {
  await page.goto("/zh-CN/settings/");
  await page.getByRole("checkbox", { name: /^显示假名读音/ }).uncheck();
  await page.getByRole("checkbox", { name: /^显示中文翻译/ }).uncheck();
  await page.goto(`/zh-CN/articles/?id=${SAMPLE_ARTICLES[0].id}`);
  const preview = page.getByTestId("article-preview-passage");
  await expect(preview).toHaveText(SAMPLE_ARTICLES[0].sentences.map(sentenceText).join(""));
  await expect(preview.locator("rt")).toHaveCount(0);
  await expect(page.getByTestId("article-preview-translation")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "中文译文", exact: true })).toHaveCount(0);
  for (const sentence of SAMPLE_ARTICLES[0].sentences) {
    await expect(page.getByText(sentence.translation, { exact: true })).toHaveCount(0);
  }
});

test("旧偏好默认整篇，分组大小及模式记忆，退出后重新开始且不保存未完成记录", async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("pokotype:preferences:v1")) {
      localStorage.setItem("pokotype:preferences:v1", JSON.stringify({
        version: 1, value: { showRomaji: true, articleSpeechEnabled: true },
      }));
    }
  });
  await seedArticle(page);
  await expect(page.getByRole("radio", { name: "整篇练习", exact: true })).toBeChecked();
  await page.getByRole("radio", { name: "整篇练习", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "分组练习", exact: true })).toBeChecked();
  await expect(page.getByLabel("每组句数", { exact: true })).toHaveValue("3");
  await page.getByLabel("每组句数", { exact: true }).selectOption("5");
  await page.reload();
  await expect(page.getByRole("radio", { name: "分组练习", exact: true })).toBeChecked();
  await expect(page.getByLabel("每组句数", { exact: true })).toHaveValue("5");
  await page.getByRole("button", { name: "开始文章练习", exact: true }).click();
  await expect(page.getByRole("radio", { name: "整篇练习", exact: true })).toHaveCount(0);
  await page.keyboard.type("shin");
  await expect(currentSentence(page)).toHaveAttribute("data-sentence-index", "1");
  await page.getByRole("button", { name: "结束练习", exact: true }).click();
  expect(await records(page)).toEqual([]);
  await expect(page.getByRole("radio", { name: "分组练习", exact: true })).toBeChecked();
  await start(page, "full");
  await expect(currentSentence(page)).toHaveAttribute("data-sentence-index", "0");
  await expect(page.getByLabel("输入进度").locator("[data-romaji-typed]")).toHaveText("");
  await page.getByRole("button", { name: "结束练习", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("radio", { name: "整篇练习", exact: true })).toBeChecked();
  expect(await records(page)).toEqual([]);
});

for (const mode of ["sentence", "group", "full"] as const) {
  test(`${labels[mode]}支持替代拼写、句末ん和快速跨句输入，只保存一条模式成绩`, async ({ page }) => {
    await seedArticle(page);
    await start(page, mode);
    await page.getByRole("checkbox", { name: "整句听读", exact: true }).uncheck();
    await page.getByRole("checkbox", { name: "分段朗读", exact: true }).uncheck();
    await page.keyboard.type("q");
    await expect(page.getByRole("status")).toContainText("这个按键不匹配");
    // shi is an alternative spelling; the existing engine accepts one final n.
    await page.keyboard.type(spelling);
    await expect(page.getByRole("heading", { name: "又向前了一小步", exact: true })).toBeVisible();
    await expect(page.locator("section").filter({
      has: page.getByRole("heading", { name: "又向前了一小步", exact: true }),
    })).toContainText(labels[mode]);
    if (mode === "group") await expect(page.getByText(/每组 3 句/)).toBeVisible();
    await expect.poll(async () => (await records(page)).length).toBe(1);
    expect(await records(page)).toMatchObject([{
      mode: "article", articlePracticeMode: mode,
      ...(mode === "group" ? { articleGroupSize: 3 } : {}),
      correct: spelling.length, errors: 1,
    }]);
    await page.keyboard.type("aaaa");
    await page.keyboard.press("Enter");
    expect(await records(page)).toHaveLength(1);
    await page.getByRole("link", { name: "练习记录", exact: true }).click();
    const row = page.getByRole("row").filter({ hasText: shortArticle.title });
    await expect(row).toContainText(labels[mode]);
    if (mode === "group") await expect(row).toContainText("每组 3 句");
    await page.reload();
    await expect(row).toHaveCount(1);
  });
}

for (const size of [3, 5, 10]) {
  test(`每组 ${size} 句按原序显示，自动切换到不足一组的末组`, async ({ page }) => {
    await seedArticle(page, {
      ...shortArticle,
      sentences: Array.from({ length: size + 1 }, (_, index) => ({
        segments: [{ text: `第${index + 1}句。`, reading: "あ。" }], translation: `第 ${index + 1} 句。`,
      })),
    });
    await page.getByRole("radio", { name: "分组练习", exact: true }).check();
    await page.getByLabel("每组句数", { exact: true }).selectOption(String(size));
    await page.getByRole("button", { name: "开始文章练习", exact: true }).click();
    await expect(passage(page).locator("[data-sentence-index]")).toHaveCount(size);
    expect(await passage(page).locator("[data-sentence-index]").evaluateAll((nodes) =>
      nodes.map((node) => Number(node.getAttribute("data-sentence-index"))),
    )).toEqual(Array.from({ length: size }, (_, index) => index));
    await page.keyboard.type("a".repeat(size));
    await expect(passage(page).locator("[data-sentence-index]")).toHaveCount(1);
    await expect(currentSentence(page)).toHaveAttribute("data-sentence-index", String(size));
    await page.keyboard.type("a");
    await expect(page.getByRole("heading", { name: "又向前了一小步", exact: true })).toBeVisible();
    await expect.poll(async () => (await records(page)).length).toBe(1);
    expect(await records(page)).toMatchObject([{ correct: size + 1, errors: 0, articleGroupSize: size }]);
  });
}

test("整篇保留已完成正文，当前句提示及翻译跟随，提示开关继续有效", async ({ page }) => {
  await seedArticle(page);
  await start(page, "full");
  await expect(passage(page).locator("[data-sentence-index]")).toHaveCount(4);
  await expect(page.getByText("中心。", { exact: true })).toBeVisible();
  await page.keyboard.type("shin");
  await expect(currentSentence(page)).toHaveAttribute("data-sentence-index", "1");
  await expect(passage(page).locator('[data-sentence-index="0"]')).toContainText("芯。");
  await expect(passage(page).locator('[data-sentence-index="0"]')).not.toHaveAttribute("aria-current", "step");
  await expect(passage(page).locator('ruby[aria-current="step"]')).toContainText("朝。");
  await expect(page.getByText("早晨。", { exact: true })).toBeVisible();
  await expect(page.getByText("中心。", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("输入进度")).toHaveText("asa");
  await page.getByRole("checkbox", { name: "罗马音提示", exact: true }).uncheck();
  await expect(page.getByLabel("输入进度").locator("[data-romaji-pending]")).toHaveText("···");
  await page.getByRole("checkbox", { name: "假名读音", exact: true }).uncheck();
  await expect(passage(page).locator("rt")).toHaveCount(0);
  await page.getByRole("checkbox", { name: "中文翻译", exact: true }).uncheck();
  await expect(page.getByText("早晨。", { exact: true })).toHaveCount(0);
  await page.keyboard.type("asa");
  await expect(currentSentence(page)).toHaveAttribute("data-sentence-index", "2");
  await expect(passage(page).locator("[data-sentence-index]")).toHaveCount(4);
});

test("连续模式从首次正确输入计时，跨句持续，暂停及失焦停表", async ({ page }) => {
  await page.clock.install();
  await seedArticle(page);
  await start(page, "full");
  await page.keyboard.type("q");
  await page.clock.fastForward(10_000);
  await expect(timer(page)).toHaveText("0 秒");
  await page.keyboard.type("sh");
  await page.clock.fastForward(3_000);
  await expect(timer(page)).toHaveText("3 秒");
  await page.keyboard.type("in");
  await expect(currentSentence(page)).toHaveAttribute("data-sentence-index", "1");
  await page.clock.fastForward(2_000);
  await expect(timer(page)).toHaveText("5 秒");
  await page.keyboard.press("Escape");
  await page.clock.fastForward(20_000);
  await page.keyboard.type("asa");
  await expect(currentSentence(page)).toHaveAttribute("data-sentence-index", "1");
  await expect(timer(page)).toHaveText("5 秒");
  await page.getByRole("button", { name: "继续练习", exact: true }).click();
  await page.clock.fastForward(2_000);
  await expect(timer(page)).toHaveText("7 秒");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.getByRole("button", { name: "继续练习", exact: true })).toBeVisible();
  await page.clock.fastForward(20_000);
  await expect(timer(page)).toHaveText("7 秒");
  await page.getByRole("button", { name: "结束练习", exact: true }).click();
  expect(await records(page)).toEqual([]);
});

test("分组及整篇默认开启分段朗读，本轮开关不覆盖逐句偏好", async ({ page }) => {
  await seedArticle(page);
  for (const mode of ["group", "full"] as const) {
    await start(page, mode);
    const segment = page.getByRole("checkbox", { name: "分段朗读", exact: true });
    const sentence = page.getByRole("checkbox", { name: "整句听读", exact: true });
    await expect(segment).toBeChecked();
    await expect(sentence).not.toBeChecked();
    await segment.uncheck();
    await sentence.check();
    await sentence.uncheck();
    await page.getByRole("button", { name: "结束练习", exact: true }).click();
    const preferences = await page.evaluate(() => JSON.parse(localStorage.getItem("pokotype:preferences:v1")!).value);
    expect(preferences).toMatchObject({ articleSpeechEnabled: true, articleSegmentSpeechEnabled: true });
  }
  await start(page, "sentence");
  await expect(page.getByRole("checkbox", { name: "整句听读", exact: true })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "分段朗读", exact: true })).toBeChecked();
});

type ModeSpeech = {
  calls: string[];
  emit: (index: number, event: "end" | "error") => void;
};
declare global {
  interface Window { __articleModeSpeech: ModeSpeech }
}

async function mockSpeech(page: Page) {
  await page.addInitScript(() => {
    class Utterance {
      text: string;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) { this.text = text; }
    }
    const callbacks: { end: (() => void) | null; error: (() => void) | null }[] = [];
    window.__articleModeSpeech = {
      calls: [],
      emit(index, event) { callbacks[index][event]?.(); },
    };
    const synthesis = Object.assign(new EventTarget(), {
      getVoices: () => [{ voiceURI: "article-mode-ja", name: "Test Japanese", lang: "ja-JP", localService: true }],
      cancel() {},
      speak(utterance: Utterance) {
        callbacks.push({ end: utterance.onend, error: utterance.onerror });
        window.__articleModeSpeech.calls.push(utterance.text);
        utterance.onstart?.();
      },
    });
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: synthesis });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: Utterance });
  });
}

test("连续听读停表，暂停中跳过保持暂停，恢复及迟到回调只推进和保存一次", async ({ page }) => {
  await page.clock.install();
  await mockSpeech(page);
  await seedArticle(page);
  await start(page, "full");
  await page.getByRole("checkbox", { name: "整句听读", exact: true }).check();
  await page.keyboard.type("sh");
  await page.clock.fastForward(2_000);
  await page.keyboard.type("in");
  await expect(page.getByText("正在朗读 · Enter 跳过", { exact: true })).toBeVisible();
  await page.clock.fastForward(5_000);
  await page.keyboard.type("asa");
  await expect(timer(page)).toHaveText("2 秒");
  await expect(currentSentence(page)).toHaveAttribute("data-sentence-index", "0");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "跳过朗读", exact: true }).click();
  await page.evaluate(() => window.__articleModeSpeech.emit(0, "end"));
  await expect(currentSentence(page)).toHaveAttribute("data-sentence-index", "1");
  await expect(page.getByRole("button", { name: "继续练习", exact: true })).toBeVisible();
  await page.clock.fastForward(5_000);
  await expect(timer(page)).toHaveText("2 秒");
  await page.getByRole("button", { name: "继续练习", exact: true }).click();
  await page.clock.fastForward(2_000);
  await page.keyboard.type("asa");
  await page.evaluate(() => window.__articleModeSpeech.emit(1, "end"));
  await expect(currentSentence(page)).toHaveAttribute("data-sentence-index", "2");
  await page.clock.fastForward(2_000);
  await expect(timer(page)).toHaveText("6 秒");
  await page.keyboard.type("iro");
  await page.keyboard.press("Enter");
  await page.evaluate(() => window.__articleModeSpeech.emit(2, "end"));
  await expect(currentSentence(page)).toHaveAttribute("data-sentence-index", "3");
  await page.keyboard.type("umi");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "又向前了一小步", exact: true })).toBeVisible();
  await page.evaluate(() => {
    window.__articleModeSpeech.emit(3, "error");
    window.__articleModeSpeech.emit(0, "end");
  });
  await expect.poll(async () => (await records(page)).length).toBe(1);
  const saved = await records(page);
  expect(saved).toMatchObject([{ correct: spelling.length, errors: 0 }]);
  expect(saved[0].durationMs).toBeGreaterThanOrEqual(6_000);
  expect(saved[0].durationMs).toBeLessThan(7_000);
  expect(await page.evaluate(() => window.__articleModeSpeech.calls)).toEqual(["芯。", "朝。", "色。", "海。"]);
});

test("长文自动跟随当前片段，长提示内部滚动，桌面及手机无横向溢出", async ({ page }) => {
  await seedArticle(page, {
    ...shortArticle,
    sentences: Array.from({ length: 30 }, (_, index) => ({
      segments: [{
        text: `第${index + 1}句。${"春の風が静かに吹いています。".repeat(5)}`,
        reading: index === 0 ? "し".repeat(120) : "あ。",
      }],
      translation: index === 0 ? "这是一段很长的中文翻译。".repeat(80) : `第 ${index + 1} 句翻译。`,
    })),
  });
  await start(page, "full");
  for (const width of [1440, 800, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(passage(page)).toBeVisible();
    await expect(page.getByLabel("输入进度")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const boundedHints = await page.getByLabel("输入进度").evaluate((element) => {
      let node: HTMLElement | null = element as HTMLElement;
      while (node && !node.contains(document.querySelector('[data-testid="article-passage"]'))) {
        if (/auto|scroll/.test(getComputedStyle(node).overflowY) && node.clientHeight < 450) return true;
        node = node.parentElement;
      }
      return false;
    });
    expect(boundedHints).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.keyboard.type("si".repeat(120) + "a".repeat(28));
  await expect(currentSentence(page)).toHaveAttribute("data-sentence-index", "29");
  expect(await passage(page).evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(passage(page).locator('ruby[aria-current="step"]')).toBeInViewport();
  await expect(passage(page).locator("[data-sentence-index]")).toHaveCount(30);
});

test("800×600 整篇练习进入第三片段后光标完整可见且正文当前位置仍在视口内", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await page.goto(`/zh-CN/articles/?id=${SAMPLE_ARTICLES[0].id}`);
  await start(page, "full");
  await page.keyboard.type("watasiha" + "maiasasitijiniokite");
  const currentGroup = page.getByLabel("输入进度").locator('[data-romaji-group][aria-current="step"]');
  await expect(currentGroup).toHaveAttribute("data-romaji-group", "2");
  const caret = currentGroup.locator("i");
  await expect.poll(() => caret.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= innerHeight;
  })).toBe(true);
  await expect(passage(page).locator('ruby[aria-current="step"]')).toBeInViewport();
});

test("旧文章记录没有模式字段时历史仍显示逐句练习", async ({ page }) => {
  await seedArticle(page);
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("pokotype-v1", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("records", "readwrite");
      const value = {
        id: "legacy-article-record", mode: "article", title: "旧文章成绩",
        completedAt: "2026-01-01T00:00:00.000Z", correct: 10, errors: 0, durationMs: 5_000, weakItems: [],
      };
      transaction.objectStore("records").put({ id: value.id, version: 1, value });
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onabort = () => { database.close(); reject(transaction.error); };
    };
  }));
  await page.goto("/zh-CN/history/");
  await expect(page.getByRole("row").filter({ hasText: "旧文章成绩" })).toContainText("逐句练习");
});
