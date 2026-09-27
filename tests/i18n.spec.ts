import { expect, test, type Page, type Route } from "@playwright/test";
import { SAMPLE_ARTICLES } from "../src/lib/articles";
import type { PracticeRecord } from "../src/lib/storage";

const localeStorageKey = "pokotype:locale:v1";
const locales = [
  { locale: "zh-CN", language: "界面语言", heading: "五十音练习", navigation: "主导航" },
  { locale: "en", language: "Interface language", heading: "Kana practice", navigation: "Main navigation" },
  { locale: "ja", language: "表示言語", heading: "五十音練習", navigation: "メインナビゲーション" },
] as const;

function switcher(page: Page, name = "界面语言") {
  return page.getByRole("combobox", { name, exact: true });
}

async function completeKanaSession(page: Page) {
  for (let index = 0; index < 20; index++) {
    await expect(page.getByText(`${index + 1} / 20`, { exact: true })).toBeVisible();
    const remaining = await page.getByLabel("输入进度").locator("[data-romaji-pending]").allTextContents();
    expect(remaining.join("")).not.toBe("");
    await page.keyboard.type(remaining.join(""));
  }
  await expect(page.getByRole("heading", { name: "又向前了一小步", exact: true })).toBeVisible();
}

async function seedRecords(page: Page, records: PracticeRecord[]) {
  await page.evaluate((values) => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open("pokotype-v1", 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("records", "readwrite");
      for (const value of values) tx.objectStore("records").put({ id: value.id, version: 1, value });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  }), records);
}

for (const { locale, language, heading, navigation } of locales) {
  test(`${locale} 静态直达与刷新保留界面语言和导航高亮`, async ({ page }) => {
    const response = await page.goto(`/${locale}/`);
    expect(response?.ok()).toBe(true);
    expect(await response!.text()).toContain(`<html lang="${locale}"`);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await expect(switcher(page, language)).toBeEnabled();
    await expect(switcher(page, language)).toHaveValue(locale);
    await expect(switcher(page, language).locator("option")).toHaveText(["简体中文", "English", "日本語"]);
    const nav = page.getByRole("navigation", { name: navigation, exact: true });
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(nav.locator('[aria-current="page"]')).toHaveAttribute("href", `/${locale}/`);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(switcher(page, language)).toHaveValue(locale);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  });
}

test.describe("首页无脚本直达", () => {
  test.use({ javaScriptEnabled: false, locale: "en-US" });

  test("服务端直接打开日语首页，不显示语言过渡页", async ({ page, baseURL }) => {
    const response = await page.goto("/");
    expect(response?.ok()).toBe(true);
    const initialRequest = response!.request().redirectedFrom();
    expect(initialRequest?.url()).toBe(new URL("/", baseURL).href);
    expect((await initialRequest!.response())?.status()).toBe(307);
    await expect(page).toHaveURL(new URL("/ja/", baseURL).href);
    const html = await response!.text();
    expect(html).toContain('<html lang="ja"');
    expect(html).not.toContain("正在打开 · Opening · ページを開いています");
    await expect(page.getByRole("heading", { name: "五十音練習", exact: true })).toBeVisible();
    await expect(switcher(page, "表示言語")).toHaveValue("ja");
  });
});

for (const { browserLocale, savedLocale } of [
  { browserLocale: "en-US", savedLocale: "en" },
  { browserLocale: "zh-CN", savedLocale: "zh-CN" },
]) {
  test.describe(`首页默认语言：${browserLocale}`, () => {
    test.use({ locale: browserLocale });

    test("浏览器语言和旧偏好不覆盖日语首页", async ({ page }) => {
      await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
        key: localeStorageKey, value: savedLocale,
      });
      await page.goto("/");
      await expect(page).toHaveURL(/\/ja\/$/);
      await expect(page.locator("html")).toHaveAttribute("lang", "ja");
      await expect(page.getByRole("heading", { name: "五十音練習", exact: true })).toBeVisible();
      await expect(switcher(page, "表示言語")).toHaveValue("ja");
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("lang", "ja");
    });
  });
}

test("从默认首页切换语言保留查询参数、锚点和练习偏好", async ({ page }) => {
  await page.goto("/?from=default&tag=one%20two#kana-title");
  await expect(page).toHaveURL(/\/ja\/\?from=default&tag=one%20two#kana-title$/);
  await expect(switcher(page, "表示言語")).toBeEnabled();
  await page.getByLabel("ローマ字のヒントを表示", { exact: true }).uncheck();
  await expect(switcher(page, "表示言語")).toBeEnabled();
  await switcher(page, "表示言語").selectOption("en");
  await expect(page).toHaveURL(/\/en\/\?from=default&tag=one%20two#kana-title$/);
  await expect(page.getByLabel("Show romaji hints", { exact: true })).not.toBeChecked();
  await expect(switcher(page, "Interface language")).toBeEnabled();
  await switcher(page, "Interface language").selectOption("zh-CN");
  await expect(page).toHaveURL(/\/zh-CN\/\?from=default&tag=one%20two#kana-title$/);
  await expect(page.getByLabel("显示罗马音提示", { exact: true })).not.toBeChecked();
  await expect(page.getByRole("heading", { name: "五十音练习", exact: true })).toBeVisible();
});

test("从默认首页开始练习保留会话并可输入第一题", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "練習を始める 20 問", exact: true }).click();
  await expect(page).toHaveURL(/\/ja\/practice\/\?session=[0-9a-f-]+$/);
  await expect(page.getByRole("region", { name: "五十音タイピング練習", exact: true })).toBeFocused();
  await expect(page.getByText("1 / 20", { exact: true })).toBeVisible();
  const remaining = await page.getByLabel("入力の進捗").locator("[data-romaji-pending]").allTextContents();
  expect(remaining.join("")).not.toBe("");
  await page.keyboard.type(remaining.join(""));
  await expect(page.getByText("2 / 20", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("语言切换 replace 当前页面并保留查询参数、锚点和练习偏好", async ({ page }) => {
  await page.goto("/zh-CN/history/");
  await page.goto("/zh-CN/?from=shared&tag=one%20two#kana-title");
  await page.getByLabel("显示罗马音提示", { exact: true }).uncheck();
  await expect(switcher(page)).toBeEnabled();
  await switcher(page).selectOption("en");
  await expect(page).toHaveURL(/\/en\/\?from=shared&tag=one%20two#kana-title$/);
  await expect(page.getByLabel("Show romaji hints", { exact: true })).not.toBeChecked();
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), localeStorageKey)).toBe("en");
  await page.goBack();
  await expect(page).toHaveURL(/\/zh-CN\/history\/$/);
});

test("带前缀 URL 优先于已选语言，旧入口按保存偏好跳转并保留参数", async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, "ja"), localeStorageKey);
  await page.goto("/en/");
  await expect(page.getByRole("heading", { name: "Kana practice", exact: true })).toBeVisible();
  await expect(switcher(page, "Interface language")).toHaveValue("en");
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), localeStorageKey)).toBe("en");
  await page.goto("/articles/?from=legacy#library");
  await expect(page).toHaveURL(/\/ja\/articles\/\?from=legacy#library$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
  await page.goto("/generate/?from=legacy#library");
  await expect(page).toHaveURL(/\/ja\/articles\/\?from=legacy#library$/);
});

test.describe("浏览器语言识别", () => {
  test.use({ locale: "ja-JP" });
  test("浏览器日语不会覆盖英文直达链接", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/en/");
    await expect(switcher(page, "Interface language")).toBeEnabled();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { name: "Kana practice", exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("日语浏览器打开根入口直接进入日语首页", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/ja\/$/);
    await expect(switcher(page, "表示言語")).toHaveValue("ja");
  });
});

test("语言偏好存储被拒绝时仍可切换", async ({ page }) => {
  await page.addInitScript((key) => {
    const getItem = Storage.prototype.getItem;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.getItem = function (name) {
      if (name === key) throw new DOMException("Storage denied", "SecurityError");
      return getItem.call(this, name);
    };
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException("Storage denied", "SecurityError");
      return setItem.call(this, name, value);
    };
  }, localeStorageKey);
  await page.goto("/zh-CN/");
  await expect(switcher(page)).toBeEnabled();
  await switcher(page).selectOption("en");
  await expect(page).toHaveURL(/\/en\/$/);
  await expect(page.getByRole("heading", { name: "Kana practice", exact: true })).toBeVisible();
  await expect(switcher(page, "Interface language")).toBeEnabled();
});

test("练习、暂停和结果页锁定语言，退出后可切换并读取同一成绩", async ({ page }) => {
  await page.goto("/zh-CN/");
  await page.getByRole("button", { name: "开始练习 20 题", exact: true }).click();
  await expect(page).toHaveURL(/\/zh-CN\/practice\/\?session=/);
  // The global session guard is set before the practice route finishes mounting.
  // Wait for its focus handoff before sending keyboard input.
  await expect(page.getByRole("region", { name: "五十音打字练习", exact: true })).toBeFocused();
  const progress = page.getByLabel("输入进度", { exact: true });
  await expect(progress).toBeVisible();
  await expect(switcher(page)).toBeDisabled();
  await expect(switcher(page)).toHaveAccessibleDescription("请先完成或退出练习");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "继续练习", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("休息一下，计时已停止。");
  await expect(switcher(page)).toBeDisabled();
  const pausedProgress = await progress.textContent();
  await page.keyboard.type("aiueo");
  await expect(progress).toHaveText(pausedProgress!);
  await page.getByRole("button", { name: "继续练习", exact: true }).click();
  await completeKanaSession(page);
  await expect(switcher(page)).toBeDisabled();
  await page.getByRole("button", { name: "返回练习设置", exact: true }).click();
  await expect(switcher(page)).toBeEnabled();
  await switcher(page).selectOption("en");
  await page.getByRole("navigation", { name: "Main navigation", exact: true }).getByRole("link", { name: "History", exact: true }).click();
  await expect(page.getByRole("cell", { name: /Kana\s*Kana · Free practice/ })).toBeVisible();
});

test("旧假名系统标题跨语言显示，文章标题保持原文", async ({ page }) => {
  await page.goto("/zh-CN/");
  await expect(page.getByRole("button", { name: "开始练习 20 题", exact: true })).toBeEnabled();
  const base = { completedAt: "2026-09-27T08:00:00.000Z", correct: 20, errors: 1, durationMs: 30000, weakItems: [] };
  await seedRecords(page, [
    { ...base, id: "legacy-normal", mode: "kana", title: "五十音 · 自由练习" },
    { ...base, id: "legacy-weak", mode: "kana", title: "五十音 · 错项强化" },
    { ...base, id: "user-title", mode: "article", title: "五十音 · 自由练习" },
  ]);
  await page.goto("/en/history/");
  await expect(page.getByRole("cell", { name: /Kana\s*Kana · Free practice/ })).toBeVisible();
  await expect(page.getByRole("cell", { name: /Kana\s*Kana · Weak-point practice/ })).toBeVisible();
  await expect(page.getByRole("cell", { name: /Article\s*五十音 · 自由练习/ })).toBeVisible();
  await switcher(page, "Interface language").selectOption("ja");
  await expect(page.getByRole("cell", { name: /仮名\s*五十音 · 自由練習/ })).toBeVisible();
  await expect(page.getByRole("cell", { name: /仮名\s*五十音 · 苦手克服/ })).toBeVisible();
  await expect(page.getByRole("cell", { name: /記事\s*五十音 · 自由练习/ })).toBeVisible();
});

test("密钥草稿和连接检查锁定语言，保存或清空后解锁", async ({ page }) => {
  let pending: Route | undefined;
  await page.route("https://api.deepseek.com/models", (route) => { pending = route; });
  await page.goto("/zh-CN/settings/");
  const card = page.getByRole("region", { name: "DeepSeek API 密钥", exact: true });
  const key = card.getByLabel("DeepSeek API 密钥", { exact: true });
  await expect(switcher(page)).toBeEnabled();
  await key.fill("test-only-locale-guard-key");
  await expect(switcher(page)).toBeDisabled();
  await key.fill("");
  await expect(switcher(page)).toBeEnabled();
  await key.fill("test-only-locale-guard-key");
  await card.getByRole("button", { name: "保存密钥", exact: true }).click();
  await expect(switcher(page)).toBeEnabled();
  await card.getByRole("button", { name: "检查连接", exact: true }).click();
  await expect.poll(() => Boolean(pending)).toBe(true);
  await expect(switcher(page)).toBeDisabled();
  await pending!.fulfill({ json: { object: "list", data: [{ id: "deepseek-flash" }] } });
  await expect(card.getByText("检查通过", { exact: true })).toBeVisible();
  await expect(switcher(page)).toBeEnabled();
});

test("编辑和生成弹窗锁定语言，保存失败关闭提示仍锁定，重试后可切换", async ({ page }) => {
  await page.goto(`/zh-CN/articles/?id=${SAMPLE_ARTICLES[0].id}`);
  await page.getByRole("button", { name: "修改标题与读音", exact: true }).click();
  await expect(switcher(page)).toBeDisabled();
  await page.getByRole("button", { name: "取消修改", exact: true }).click();
  await expect(switcher(page)).toBeEnabled();
  await page.getByRole("button", { name: "修改标题与读音", exact: true }).click();
  await page.getByLabel("文章标题", { exact: true }).fill("保存失败后保留的文章");
  await page.evaluate(() => {
    const target = window as typeof window & { failI18nArticleWrites?: boolean };
    target.failI18nArticleWrites = true;
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === "articles" && target.failI18nArticleWrites) throw new DOMException("Simulated storage quota", "QuotaExceededError");
      return put.apply(this, args);
    };
  });
  await page.getByRole("button", { name: "保存为副本", exact: true }).click();
  await expect(page.getByRole("heading", { name: "保存失败后保留的文章", exact: true })).toBeVisible();
  await expect(page.locator('.error[role="alert"]')).toContainText("未能保存到浏览器");
  await page.getByRole("button", { name: "关闭提示", exact: true }).click();
  await expect(switcher(page)).toBeDisabled();
  await page.evaluate(() => { (window as typeof window & { failI18nArticleWrites?: boolean }).failI18nArticleWrites = false; });
  await page.getByRole("button", { name: "重试保存", exact: true }).click();
  await expect(switcher(page)).toBeEnabled();
  await switcher(page).selectOption("en");
  await expect(page.getByRole("heading", { name: "保存失败后保留的文章", exact: true })).toBeVisible();
  await page.goto("/zh-CN/articles/");
  await page.getByRole("button", { name: "生成新文章", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "AI 生成文章", exact: true });
  // The native dialog makes the page inert; inspect the actual disabled control.
  await expect(page.locator('select[aria-label="界面语言"]').first()).toBeDisabled();
  await dialog.getByRole("button", { name: "关闭生成窗口", exact: true }).click();
  await expect(switcher(page)).toBeEnabled();
});

test("移动菜单可用键盘关闭，语言选择器在菜单中切换", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/zh-CN/");
  await expect(switcher(page)).toHaveCount(0);
  const menu = page.getByRole("button", { name: "导航菜单", exact: true });
  await menu.click();
  await expect(switcher(page)).toBeVisible();
  await expect(switcher(page)).toBeEnabled();
  await switcher(page).focus();
  await expect(switcher(page)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toBeFocused();
  await menu.click();
  await switcher(page).selectOption("ja");
  await expect(page).toHaveURL(/\/ja\/$/);
  await expect(page.getByRole("heading", { name: "五十音練習", exact: true })).toBeVisible();
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
});


test("禁用 JavaScript 时旧入口仍提供三语链接，英文页直接输出英文内容", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  try {
    const response = await page.goto("/articles/");
    expect(response?.ok()).toBe(true);
    await expect(page.getByRole("link", { name: "简体中文", exact: true })).toHaveAttribute("href", "/zh-CN/articles/");
    await expect(page.getByRole("link", { name: "English", exact: true })).toHaveAttribute("href", "/en/articles/");
    await expect(page.getByRole("link", { name: "日本語", exact: true })).toHaveAttribute("href", "/ja/articles/");
    await page.getByRole("link", { name: "English", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/articles\/$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page).toHaveTitle(/My articles/);
    await expect(page.getByRole("navigation", { name: "Main navigation", exact: true }).getByRole("link", { name: "My articles", exact: true })).toBeVisible();
    const home = await page.goto("/en/");
    const html = await home!.text();
    expect(html).toContain("Start with one kana. Type Japanese into memory.");
    expect(html).not.toContain("从一个假名开始，把日语敲进记忆。");
    expect(html).not.toContain("一つのかなから、日本語を指で覚えよう。");
  } finally {
    await context.close();
  }
});

for (const copy of [
  {
    locale: "en",
    language: "Interface language",
    start: /^Start practice\s*20 questions$/,
    session: "Kana typing practice",
    progress: "Typing progress",
    pause: "Pause",
    resume: "Resume practice",
    complete: "Another small step forward",
    returnSettings: "Back to practice settings",
    navigation: "Main navigation",
    historyLink: "History",
    historyTitle: "Practice history",
    recordTitle: "Kana · Free practice",
    articlesLink: "My articles",
    articleStart: "Start article practice",
    passage: "Practice text",
    statistics: "Practice statistics",
  },
  {
    locale: "ja",
    language: "表示言語",
    start: /^練習を始める\s*20 問$/,
    session: "五十音タイピング練習",
    progress: "入力の進捗",
    pause: "一時停止",
    resume: "練習を再開",
    complete: "また一歩、前へ",
    returnSettings: "練習設定に戻る",
    navigation: "メインナビゲーション",
    historyLink: "練習履歴",
    historyTitle: "練習履歴",
    recordTitle: "五十音 · 自由練習",
    articlesLink: "マイ記事",
    articleStart: "記事の練習を開始",
    passage: "練習本文",
    statistics: "練習の統計",
  },
] as const) {
  test(`${copy.locale} 完成五十音并读取历史，文章练习保持翻译和页脚隐藏`, async ({ page }) => {
    await page.goto(`/${copy.locale}/`);
    const language = switcher(page, copy.language);
    const marketing = page.locator('section[aria-labelledby="next-practice-title"]');
    await expect(language).toBeEnabled();
    await expect(marketing).toBeVisible();
    await page.getByRole("button", { name: copy.start }).click();
    await expect(page.getByRole("region", { name: copy.session, exact: true })).toBeFocused();
    const progress = page.getByLabel(copy.progress, { exact: true });
    await expect(progress).toBeVisible();
    await expect(language).toBeDisabled();
    await expect(marketing).toBeHidden();
    await page.getByRole("button", { name: copy.pause, exact: true }).click();
    await expect(page.getByRole("button", { name: copy.resume, exact: true })).toBeVisible();
    await expect(language).toBeDisabled();
    await expect(marketing).toBeHidden();
    await page.getByRole("button", { name: copy.resume, exact: true }).click();

    for (let index = 0; index < 20; index++) {
      await expect(page.getByText(`${index + 1} / 20`, { exact: true })).toBeVisible();
      await expect(language).toBeDisabled();
      await expect(marketing).toBeHidden();
      const remaining = (await progress.locator("[data-romaji-pending]").allTextContents()).join("");
      expect(remaining).not.toBe("");
      await page.keyboard.type(remaining);
    }
    await expect(page.getByRole("heading", { name: copy.complete, exact: true })).toBeVisible();
    await expect(language).toBeDisabled();
    await page.getByRole("button", { name: copy.returnSettings, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${copy.locale}/$`));
    await expect(language).toBeEnabled();
    await expect(marketing).toBeVisible();

    const navigation = page.getByRole("navigation", { name: copy.navigation, exact: true });
    await navigation.getByRole("link", { name: copy.historyLink, exact: true }).click();
    await expect(page.getByRole("heading", { name: copy.historyTitle, exact: true })).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.getByRole("cell").filter({ hasText: copy.recordTitle })).toBeVisible();
    await expect(language).toBeEnabled();

    await navigation.getByRole("link", { name: copy.articlesLink, exact: true }).click();
    await page.getByRole("link").filter({
      has: page.getByRole("heading", { name: SAMPLE_ARTICLES[0].title, exact: true }),
    }).click();
    await page.getByRole("button", { name: copy.articleStart, exact: true }).click();
    await expect(page.getByLabel(copy.passage, { exact: true })).toBeVisible();
    await expect(page.getByLabel(copy.passage, { exact: true })).toHaveAttribute("lang", "ja");
    await expect(page.getByLabel(copy.progress, { exact: true })).toBeVisible();
    await expect(page.getByLabel(copy.statistics, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: copy.pause, exact: true })).toBeVisible();
    await expect(language).toBeDisabled();
    await expect(marketing).toBeHidden();
  });
}
