import { expect, test, type Locator, type Page } from "@playwright/test";
import { SAMPLE_ARTICLES, type Article } from "../src/lib/articles";
import type { PracticeRecord } from "../src/lib/storage";

const article: Article = {
  ...SAMPLE_ARTICLES[0],
  id: "test-mobile-input",
  title: "触屏输入回归文章",
  source: "ai",
  sentences: [
    { segments: [{ text: "私。", reading: "わたし。" }], translation: "我。" },
    { segments: [{ text: "朝。", reading: "あさ。" }], translation: "早晨。" },
    { segments: [{ text: "海。", reading: "うみ。" }], translation: "大海。" },
  ],
};
const modeLabels = { sentence: "逐句练习", group: "分组练习", full: "整篇练习" } as const;
const input = (page: Page) => page.getByRole("textbox", { name: "罗马音输入", exact: true });
const progress = (page: Page) => page.getByLabel("输入进度", { exact: true });
const stage = (page: Page) => page.locator("[data-practice-stage]");
const typed = async (page: Page) => (await progress(page).locator("[data-romaji-typed]").allTextContents()).join("");
const pending = async (page: Page) => (await progress(page).locator("[data-romaji-pending]").allTextContents()).join("");
const accuracy = (page: Page) => page.getByLabel("练习统计").locator(":scope > span").nth(1);

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("pokotype:preferences:v1", JSON.stringify({
      version: 1,
      value: {
        groupIds: ["contracted-き"], showRomaji: true,
        keySoundEnabled: false, kanaSpeechEnabled: false,
        articleSpeechEnabled: false, articleSegmentSpeechEnabled: false,
      },
    }));
  });
});

async function focusPractice(page: Page) {
  const currentGroup = progress(page).locator('[aria-current="step"]');
  await (await currentGroup.count() ? currentGroup : progress(page)).tap();
  await expect(input(page)).toBeFocused();
}

async function expectConcealedReceiver(page: Page) {
  const appearance = await input(page).evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return { opacity: style.opacity, position: style.position, width: rect.width, height: rect.height };
  });
  expect(appearance.opacity).toBe("0");
  expect(appearance.position).toBe("fixed");
  expect(appearance.width).toBeLessThanOrEqual(1);
  expect(appearance.height).toBeLessThanOrEqual(1);
}

async function startArticle(page: Page, mode: keyof typeof modeLabels = "full", value: Article = article, focus = true) {
  await page.goto("/zh-CN/");
  await expect(page.getByRole("button", { name: "开始练习 20 题", exact: true })).toBeEnabled();
  await page.evaluate((value) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("pokotype-v1", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("articles", "readwrite");
      transaction.objectStore("articles").put({ id: value.id, version: 1, value });
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onabort = () => { database.close(); reject(transaction.error); };
    };
  }), value);
  await page.goto(`/zh-CN/articles/?id=${value.id}`);
  await page.getByRole("radio", { name: modeLabels[mode], exact: true }).check();
  await page.getByRole("button", { name: "开始文章练习", exact: true }).click();
  await expect(progress(page)).toBeVisible();
  if (focus) await focusPractice(page);
}

async function readRecords(page: Page): Promise<PracticeRecord[]> {
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

async function dispatchText(field: Locator, value: string, inputType: string, isComposing = false) {
  await field.evaluate((element, payload) => {
    (element as HTMLInputElement).value = payload.value;
    element.dispatchEvent(new InputEvent("input", {
      bubbles: true, inputType: payload.inputType, data: payload.value, isComposing: payload.isComposing,
    }));
  }, { value, inputType, isComposing });
}

async function clearBuffer(page: Page) {
  await dispatchText(input(page), "", "deleteContentBackward");
}

test("手机点击题面输入五十音和错项强化，换题保留焦点且只保存一次成绩", async ({ page }) => {
  await page.goto("/zh-CN/");
  await page.getByRole("button", { name: "开始练习 20 题", exact: true }).tap();
  const field = input(page);
  await stage(page).tap();
  await expect(field).toBeFocused();
  await expectConcealedReceiver(page);
  await field.evaluate((element) => {
    element.setAttribute("data-persistent-input", "yes");
    element.setAttribute("data-keydown-count", "0");
    element.addEventListener("keydown", () => {
      element.setAttribute("data-keydown-count", String(Number(element.getAttribute("data-keydown-count")) + 1));
    });
  });
  await expect(field).toHaveAttribute("autocapitalize", "none");
  await expect(field).toHaveAttribute("autocomplete", "off");
  await expect(field).toHaveAttribute("spellcheck", "false");
  await expect(page.locator("header")).toBeHidden();
  await expect(page.locator("footer")).toBeHidden();
  await page.keyboard.insertText("q");
  await expect(page.getByRole("status")).toContainText("无需退格");
  for (let index = 0; index < 20; index++) {
    await expect(field).toBeFocused();
    await expect(field).toHaveAttribute("data-persistent-input", "yes");
    await expect(field).toHaveAttribute("data-keydown-count", "0");
    await page.keyboard.insertText((await pending(page)).toUpperCase());
  }
  await expect(page.getByRole("heading", { name: "又向前了一小步", exact: true })).toBeVisible();
  await expect(page.locator("header")).toBeVisible();
  await expect.poll(async () => (await readRecords(page)).length).toBe(1);
  expect(await readRecords(page)).toMatchObject([{ mode: "kana", kanaPracticeMode: "normal", errors: 1 }]);
  await page.keyboard.insertText("aaaa");
  expect(await readRecords(page)).toHaveLength(1);
  await page.getByRole("button", { name: "返回练习设置", exact: true }).tap();
  await expect(page.getByRole("button", { name: "开始练习 20 题", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "错项强化", exact: true }).tap();
  await focusPractice(page);
  await page.keyboard.insertText(await pending(page));
  await expect(page.getByText("2 / 20", { exact: true })).toBeVisible();
});

for (const mode of Object.keys(modeLabels) as (keyof typeof modeLabels)[]) {
  test(`手机${modeLabels[mode]}可批量跨句输入，保持节点并记录正确模式`, async ({ page }) => {
    await startArticle(page, mode);
    await input(page).evaluate((element) => element.setAttribute("data-persistent-input", "yes"));
    await page.keyboard.insertText("WATASI");
    await expect(page.getByText(/^2 \/ 3/)).toBeVisible();
    await expect(input(page)).toBeFocused();
    await expect(input(page)).toHaveAttribute("data-persistent-input", "yes");
    await page.keyboard.insertText("asaumi");
    await expect(page.getByRole("heading", { name: "又向前了一小步", exact: true })).toBeVisible();
    await expect.poll(async () => (await readRecords(page)).length).toBe(1);
    expect(await readRecords(page)).toMatchObject([{
      mode: "article", articlePracticeMode: mode, correct: 12, errors: 0,
    }]);
    await page.keyboard.insertText("watasi");
    expect(await readRecords(page)).toHaveLength(1);
  });
}

test("安卓组合输入按增量推进，最终提交不重复计分，实体键盘也仅处理一次", async ({ page }) => {
  await startArticle(page);
  await input(page).dispatchEvent("compositionstart", { data: "" });
  for (const value of ["w", "wa", "wat"]) {
    await dispatchText(input(page), value, "insertCompositionText", true);
    await expect.poll(() => typed(page)).toBe(value);
  }
  await input(page).dispatchEvent("compositionend", { data: "wat" });
  await dispatchText(input(page), "wat", "insertText");
  await expect.poll(() => typed(page)).toBe("wat");
  await expect(accuracy(page)).toContainText("100");
  await page.keyboard.type("a");
  await expect.poll(() => typed(page)).toBe("wata");
  await expect(accuracy(page)).toContainText("100");
  await page.keyboard.insertText("si");
  await expect(page.getByText("2 / 3", { exact: true })).toBeVisible();
});

test("粘贴、拖入、自动替换、删除和非拉丁文本不推进也不回滚", async ({ page }) => {
  await startArticle(page);
  await page.keyboard.insertText("w");
  for (const [value, type] of [
    ["wa", "insertFromPaste"], ["wat", "insertFromDrop"],
    ["watasi", "insertReplacementText"], ["wa", "deleteContentBackward"],
    ["", "deleteContentBackward"], ["あ", "insertText"],
  ]) {
    await dispatchText(input(page), value, type);
    await expect.poll(() => typed(page)).toBe("w");
    await expect(accuracy(page)).toContainText("100");
  }
  await expect(page.getByText("请切换到英文 26 键键盘。", { exact: true })).toBeVisible();
  await clearBuffer(page);
  await page.keyboard.insertText("a");
  await expect.poll(() => typed(page)).toBe("wa");
  await expect(accuracy(page)).toContainText("100");
  // Verify the cancelable native event path as well as adapter fallback above.
  const allowed = await input(page).evaluate((element) => ["insertFromPaste", "insertFromDrop", "insertReplacementText"].map((inputType) =>
    element.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType, data: "t" })),
  ));
  expect(allowed).toEqual([false, false, false]);
});

test("输入框内暂停、规则弹窗和隐藏页丢弃文字，恢复时不补计", async ({ page }) => {
  await startArticle(page);
  await page.keyboard.insertText("w");
  await page.keyboard.press("Escape");
  await page.keyboard.insertText("qq");
  await expect.poll(() => typed(page)).toBe("w");
  await page.getByRole("button", { name: "继续练习", exact: true }).tap();
  await expect(input(page)).toBeFocused();
  await page.keyboard.insertText("a");
  await expect.poll(() => typed(page)).toBe("wa");
  await page.getByRole("button", { name: "输入规则", exact: true }).tap();
  await page.getByRole("button", { name: "关闭输入规则", exact: true }).tap();
  await expect(page.getByRole("button", { name: "继续练习", exact: true })).toBeVisible();
  await focusPractice(page);
  await page.keyboard.insertText("q");
  await expect.poll(() => typed(page)).toBe("wa");
  await page.getByRole("button", { name: "继续练习", exact: true }).tap();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.keyboard.insertText("qq");
  await expect.poll(() => typed(page)).toBe("wa");
  await page.evaluate(() => {
    Reflect.deleteProperty(document, "hidden");
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.keyboard.insertText("t");
  await expect.poll(() => typed(page)).toBe("wat");
  await expect(accuracy(page)).toContainText("100");
  // Cmd/Control+Tab may leave the window without delivering a keyup event.
  await input(page).dispatchEvent("keydown", { key: "Meta", metaKey: true });
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.getByRole("button", { name: "继续练习", exact: true })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.keyboard.insertText("a");
  await expect.poll(() => typed(page)).toBe("wata");
  await expect(accuracy(page)).toContainText("100");
});

test("输入框过滤长按重复和快捷键产生的文本", async ({ page }) => {
  await startArticle(page);
  await page.keyboard.insertText("w");
  for (const options of [{ repeat: true }, { ctrlKey: true }, { altKey: true }, { metaKey: true }]) {
    await input(page).dispatchEvent("keydown", { key: "a", ...options });
    await dispatchText(input(page), "wa", "insertText");
    await input(page).dispatchEvent("keyup", { key: "a" });
    await expect.poll(() => typed(page)).toBe("w");
    await clearBuffer(page);
  }
  await page.keyboard.insertText("a");
  await expect.poll(() => typed(page)).toBe("wa");
  await expect(accuracy(page)).toContainText("100");
});

test("整句听读时丢弃批次剩余文字，Enter 和触屏跳过后继续输入", async ({ page }) => {
  await page.addInitScript(() => {
    class Utterance {
      text: string;
      onstart: (() => void) | null = null;
      constructor(text: string) { this.text = text; }
    }
    const synthesis = Object.assign(new EventTarget(), {
      getVoices: () => [{ voiceURI: "mobile-test-ja", name: "Japanese test", lang: "ja-JP", localService: true }],
      speak: (utterance: Utterance) => queueMicrotask(() => utterance.onstart?.()),
      cancel() {},
    });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: Utterance });
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: synthesis });
  });
  await startArticle(page, "sentence");
  await page.locator("summary", { hasText: "练习设置" }).tap();
  await page.getByRole("checkbox", { name: "整句听读", exact: true }).check();
  await page.locator("summary", { hasText: "练习设置" }).tap();
  await focusPractice(page);
  await page.keyboard.insertText("watasiasa");
  await expect(page.getByRole("button", { name: "跳过朗读", exact: true })).toBeVisible();
  await page.keyboard.insertText("qq");
  await page.keyboard.press("Enter");
  await expect(page.getByText("2 / 3", { exact: true })).toBeVisible();
  await expect.poll(() => typed(page)).toBe("");
  await expect(input(page)).toBeFocused();
  await page.keyboard.insertText("asaumi");
  await page.getByRole("button", { name: "跳过朗读", exact: true }).tap();
  await expect(page.getByText("3 / 3", { exact: true })).toBeVisible();
  await expect(input(page)).toBeFocused();
  await expect.poll(() => typed(page)).toBe("");
  await page.keyboard.insertText("umi");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "又向前了一小步", exact: true })).toBeVisible();
  await expect.poll(async () => (await readRecords(page)).length).toBe(1);
  expect(await readRecords(page)).toMatchObject([{ correct: 12, errors: 0 }]);
});

for (const viewport of [
  { width: 320, height: 640 }, { width: 390, height: 844 },
  { width: 820, height: 1180 }, { width: 1366, height: 1024 },
  { width: 512, height: 768 }, { width: 844, height: 390 }, { width: 320, height: 390 },
]) {
  test(`${viewport.width}×${viewport.height}触屏使用专注布局且保留可达的输入与退出`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await startArticle(page);
    await expect(page.locator("[data-mobile-practice]")).toHaveCount(1);
    await expect(page.locator("header")).toBeHidden();
    await expect(page.locator("footer")).toBeHidden();
    await expect(page.getByLabel("键盘提示")).toBeHidden();
    await expect(page.locator("details")).not.toHaveAttribute("open");
    await expectConcealedReceiver(page);
    expect(await input(page).evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
    for (const control of [stage(page), page.getByRole("button", { name: "暂停", exact: true }), page.getByRole("button", { name: "结束练习", exact: true })]) {
      await control.scrollIntoViewIfNeeded();
      await expect(control).toBeInViewport();
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await expect(input(page)).toBeFocused();
    await page.keyboard.insertText("w");
    await expect.poll(() => typed(page)).toBe("w");
    await page.getByRole("button", { name: "结束练习", exact: true }).tap();
    await expect(page.locator("header")).toBeVisible();
    await expect(page.getByRole("button", { name: "开始文章练习", exact: true })).toBeVisible();
  });
}

test("320×390长句练习跟随当前罗马音和日文分组，输入与暂停仍可触达", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 390 });
  const longArticle: Article = {
    ...article,
    id: "test-mobile-long-sentence",
    sentences: [{
      segments: Array.from({ length: 24 }, () => ({ text: "私", reading: "わたし" })),
      translation: "这是用于检查软键盘上方长句滚动的文章。".repeat(4),
    }],
  };
  await startArticle(page, "sentence", longArticle);
  const group = progress(page).locator('[aria-current="step"]');
  const currentGroupVisible = () => group.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const scroller = element.parentElement!.parentElement!.getBoundingClientRect();
    return rect.top >= scroller.top - 1 && rect.bottom <= scroller.bottom + 1;
  });
  await page.keyboard.insertText("z");
  await expect(group).toHaveAttribute("data-romaji-group", "0");
  await expect.poll(currentGroupVisible).toBe(true);
  await page.keyboard.insertText("watasi".repeat(20) + "wa");
  await expect(input(page)).toBeFocused();
  await expect(group).toHaveAttribute("data-romaji-group", "20");
  await expect.poll(currentGroupVisible).toBe(true);
  // Native Tab focus must not scroll the hidden receiver inside the long hints.
  await page.getByRole("button", { name: "结束练习", exact: true }).focus();
  for (let index = 0; index < 6; index++) {
    await page.keyboard.press("Tab");
    if (await input(page).evaluate((element) => element === document.activeElement)) break;
  }
  await expect(input(page)).toBeFocused();
  await expect.poll(currentGroupVisible).toBe(true);
  const passage = page.getByTestId("article-passage");
  await expect.poll(() => passage.evaluate((element) => {
    const active = element.querySelector('ruby[aria-current="step"]')?.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    return !!active && active.top >= rect.top - 1 && active.bottom <= rect.bottom + 1;
  })).toBe(true);
  for (const control of [group, page.getByRole("button", { name: "暂停", exact: true })]) {
    await control.scrollIntoViewIfNeeded();
    await expect(control).toBeInViewport();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test("可视视口收缩与偏移时输入和暂停落在键盘上方，恢复不残留高度", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: Object.assign(new EventTarget(), { height: innerHeight, width: innerWidth, offsetTop: 0, offsetLeft: 0, scale: 1 }),
    });
  });
  await startArticle(page);
  for (const viewport of [{ height: 430, offsetTop: 0 }, { height: 390, offsetTop: 24 }, { height: 844, offsetTop: 0 }]) {
    await page.evaluate((value) => {
      Object.assign(window.visualViewport!, value);
      window.visualViewport!.dispatchEvent(new Event("resize"));
      window.visualViewport!.dispatchEvent(new Event("scroll"));
    }, viewport);
    for (const control of [progress(page), page.getByRole("button", { name: "暂停", exact: true })]) {
      await expect.poll(async () => {
        const rect = await control.boundingBox();
        return !!rect && rect.y >= viewport.offsetTop && rect.y + rect.height <= viewport.height + viewport.offsetTop;
      }).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  await expect(input(page)).toBeFocused();
  await page.keyboard.insertText("w");
  await expect.poll(() => typed(page)).toBe("w");
});

test.describe("桌面题面输入回归", () => {
  test.use({ viewport: { width: 1440, height: 1000 }, isMobile: false, hasTouch: false });

  test("桌面直接敲键，点击题面后继续输入，页面不展示独立输入框或原始缓冲", async ({ page }) => {
    await startArticle(page, "full", article, false);
    await expect(page.locator("[data-mobile-practice]")).toHaveCount(0);
    await expectConcealedReceiver(page);
    await expect(input(page)).not.toBeFocused();
    await page.keyboard.type("wa");
    await expect.poll(() => typed(page)).toBe("wa");
    await expect(input(page)).toHaveValue("");
    await expect(accuracy(page)).toContainText("100");
    await input(page).evaluate((element) => element.setAttribute("data-persistent-input", "desktop"));
    await stage(page).click({ position: { x: 20, y: 20 } });
    await expect(input(page)).toBeFocused();
    await page.keyboard.insertText("ta");
    await expect.poll(() => typed(page)).toBe("wata");
    await expect(accuracy(page)).toContainText("100");
    await page.keyboard.insertText("zqx");
    await expect(input(page)).toHaveValue("tazqx");
    expect(await stage(page).innerText()).not.toContain("tazqx");
    expect(await stage(page).innerText()).not.toContain("zqx");
    await expectConcealedReceiver(page);
    await page.keyboard.insertText("si");
    await expect(page.getByText("2 / 3", { exact: true })).toBeVisible();
    await expect(input(page)).toBeFocused();
    await expect(input(page)).toHaveAttribute("data-persistent-input", "desktop");
  });

  test("桌面超长逐句练习点击后输入不会将当前罗马音拉回页面中部", async ({ page }) => {
    test.setTimeout(120_000);
    const longArticle: Article = {
      ...article,
      id: "test-desktop-long-sentence",
      sentences: [{
        segments: Array.from({ length: 80 }, () => ({
          text: "私は今日図書館に行きます",
          reading: "わたしはきょうとしょかんにいきます",
        })),
        translation: "我今天去图书馆。",
      }],
    };
    await startArticle(page, "sentence", longArticle, false);
    const spellings = await progress(page).locator("[data-romaji-pending]").allTextContents();
    expect(spellings).toHaveLength(80);
    await page.keyboard.type(spellings.slice(0, 70).join(""));
    const current = progress(page).locator('[aria-current="step"]');
    await expect(current).toHaveAttribute("data-romaji-group", "70");
    await current.scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBeGreaterThan(1000);
    const currentVisible = () => current.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= innerHeight;
    });
    await expect.poll(currentVisible).toBe(true);
    await current.click();
    await expect(input(page)).toBeFocused();
    const next = (await current.locator("[data-romaji-pending]").textContent())![0];
    for (const text of ["z", next]) {
      await page.keyboard.insertText(text);
      await expect.poll(currentVisible).toBe(true);
      expect(Math.abs((await page.evaluate(() => window.scrollY)) - before)).toBeLessThanOrEqual(1);
      await expect(input(page)).toBeFocused();
    }
    await expect(current.locator("[data-romaji-typed]")).toHaveText(next);
    await expect(input(page)).toHaveValue(`z${next}`);
    expect(await stage(page).innerText()).not.toContain(`z${next}`);
    await expectConcealedReceiver(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
});
