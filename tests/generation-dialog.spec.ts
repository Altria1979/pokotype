import { expect, test, type Page, type Route } from "@playwright/test";
import { SAMPLE_ARTICLES } from "../src/lib/articles";

const endpoint = "https://api.deepseek.com/chat/completions";

async function useTestKey(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      "pokotype:api-key:v1",
      JSON.stringify({ version: 1, value: "test-only-dialog-key" }),
    );
  });
}

async function respondWithArticle(route: Route, title: string) {
  await route.fulfill({
    json: {
      choices: [{
        finish_reason: "stop",
        message: { content: JSON.stringify({
          title,
          sentences: SAMPLE_ARTICLES[0].sentences,
        }) },
      }],
    },
  });
}

async function openLibraryGenerator(page: Page) {
  await page.goto("/zh-CN/articles/");
  const trigger = page.getByRole("button", { name: "生成新文章", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "AI 生成文章", exact: true });
  await expect(dialog).toBeVisible();
  return { trigger, dialog };
}

test("选择自定义主题、等级与篇幅后原页生成，文章库立即更新并持久化", async ({ page }) => {
  await useTestKey(page);
  let calls = 0;
  await page.route(endpoint, async (route) => {
    calls++;
    expect(route.request().headers().authorization).toBe("Bearer test-only-dialog-key");
    const body = route.request().postDataJSON();
    expect(JSON.parse(body.messages[1].content)).toEqual({
      topic: "京都书店里的雨天",
      level: "N3",
      japaneseCharacterCount: "300–500",
    });
    await respondWithArticle(route, "雨の日の本屋");
  });
  const { trigger, dialog } = await openLibraryGenerator(page);
  const originalUrl = page.url();
  await dialog.getByLabel("文章主题", { exact: true }).selectOption("自定义");
  await expect(dialog.getByRole("button", { name: "生成练习文章", exact: true })).toBeDisabled();
  await dialog.getByLabel("自定义主题", { exact: true }).fill("京都书店里的雨天");
  await dialog.getByLabel("日语等级", { exact: true }).selectOption("N3");
  await dialog.getByRole("radio", { name: /中篇/ }).check();
  await dialog.getByRole("button", { name: "生成练习文章", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "雨の日の本屋", exact: true })).toBeVisible();
  await expect(dialog.getByRole("status")).toContainText("已保存到我的文章库");
  await expect(page).toHaveURL(originalUrl);
  await expect(dialog.getByRole("link", { name: "查看文章", exact: true })).toHaveAttribute("href", /^\/zh-CN\/articles\/\?id=/);
  await dialog.getByRole("button", { name: "留在当前页", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("heading", { name: "雨の日の本屋", exact: true })).toBeVisible();
  expect(calls).toBe(1);
  await page.reload();
  await expect(page.getByRole("heading", { name: "雨の日の本屋", exact: true })).toBeVisible();
  await expect(page).toHaveURL(originalUrl);
});

test("首页原地生成，仅主动查看文章才进入详情", async ({ page }) => {
  await useTestKey(page);
  await page.route(endpoint, (route) => respondWithArticle(route, "首页生成的文章"));
  await page.goto("/zh-CN/");
  const originalUrl = page.url();
  await page.getByRole("button", { name: /准备好挑战一篇文章/ }).click();
  const dialog = page.getByRole("dialog", { name: "AI 生成文章", exact: true });
  await dialog.getByRole("button", { name: "生成练习文章", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("已保存到我的文章库");
  await expect(page).toHaveURL(originalUrl);
  const articleLink = dialog.getByRole("link", { name: "查看文章", exact: true });
  const destination = await articleLink.getAttribute("href");
  await articleLink.click();
  await expect(page).toHaveURL(new URL(destination!, originalUrl).href);
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "首页生成的文章", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "开始文章练习", exact: true })).toBeEnabled();
});

test("无密钥时弹窗提供设置入口，手机不溢出、锁定背景并在 Esc 后归还焦点", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 560 });
  const { trigger, dialog } = await openLibraryGenerator(page);
  const originalUrl = page.url();
  await expect(dialog.getByRole("button", { name: "生成练习文章", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("link", { name: /前往设置/ })).toHaveAttribute("href", "/zh-CN/settings/");
  await dialog.getByLabel("文章主题", { exact: true }).selectOption("自定义");
  await dialog.getByLabel("自定义主题", { exact: true }).fill("在东京一家安静的咖啡馆度过下午".repeat(8));

  for (const viewport of [{ width: 390, height: 560 }, { width: 667, height: 375 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  }

  const scrollBefore = await page.evaluate(() => window.scrollY);
  await page.mouse.move(1, 1);
  await page.mouse.wheel(0, 500);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  await dialog.getByRole("button", { name: "关闭生成窗口", exact: true }).focus();
  for (let index = 0; index < 12; index++) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(page).toHaveURL(originalUrl);
  await page.mouse.wheel(0, 500);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(scrollBefore);
});

for (const closeMethod of ["关闭按钮", "Escape"] as const) {
  test(`${closeMethod} 中止未完成生成，重新打开不会出现迟到结果`, async ({ page }) => {
    await useTestKey(page);
    let calls = 0;
    let pendingRoute: Route | undefined;
    await page.route(endpoint, async (route) => {
      calls++;
      if (calls === 1) {
        pendingRoute = route;
        return;
      }
      await respondWithArticle(route, "重新打开后生成的文章");
    });
    const { trigger, dialog } = await openLibraryGenerator(page);
    const originalUrl = page.url();
    await dialog.getByRole("button", { name: "生成练习文章", exact: true }).click();
    await expect.poll(() => calls).toBe(1);
    await expect(dialog.getByRole("button", { name: "正在创作你的文章…", exact: true })).toBeDisabled();
    const aborted = page.waitForEvent("requestfailed", { predicate: (request) => request.url() === endpoint });
    if (closeMethod === "Escape") await page.keyboard.press("Escape");
    else await dialog.getByRole("button", { name: "关闭生成窗口", exact: true }).click();
    await aborted;
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await pendingRoute?.fulfill({ status: 200, json: { choices: [] } }).catch(() => {});
    await expect(page).toHaveURL(originalUrl);
    await trigger.click();
    await expect(dialog.locator('[role="alert"]')).toHaveCount(0);
    await dialog.getByRole("button", { name: "生成练习文章", exact: true }).click();
    await expect(dialog.getByRole("heading", { name: "重新打开后生成的文章", exact: true })).toBeVisible();
    await expect(dialog.getByRole("status")).toContainText("已保存到我的文章库");
    expect(calls).toBe(2);
  });
}

test("服务失败停留原弹窗，用户手动重试成功", async ({ page }) => {
  await useTestKey(page);
  let calls = 0;
  await page.route(endpoint, async (route) => {
    calls++;
    if (calls === 1) await route.fulfill({ status: 503, json: { error: { message: "raw body must stay private" } } });
    else await respondWithArticle(route, "手动重试生成成功");
  });
  const { dialog } = await openLibraryGenerator(page);
  const originalUrl = page.url();
  await dialog.getByLabel("文章主题", { exact: true }).selectOption("旅行");
  await dialog.getByRole("button", { name: "生成练习文章", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("DeepSeek 服务暂时异常");
  await expect(dialog.getByRole("alert")).not.toContainText("raw body");
  await expect(dialog.getByLabel("文章主题", { exact: true })).toHaveValue("旅行");
  await expect(page).toHaveURL(originalUrl);
  expect(calls).toBe(1);
  await dialog.getByRole("button", { name: "生成练习文章", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "手动重试生成成功", exact: true })).toBeVisible();
  await expect(dialog.getByRole("status")).toContainText("已保存到我的文章库");
  expect(calls).toBe(2);
  await expect(page).toHaveURL(originalUrl);
});

test("生成结果写入失败时保留文章，重试保存不重复请求 AI", async ({ page }) => {
  await useTestKey(page);
  let calls = 0;
  await page.route(endpoint, async (route) => {
    calls++;
    await respondWithArticle(route, "重试保存的生成文章");
  });
  const { dialog } = await openLibraryGenerator(page);
  await page.evaluate(() => {
    const target = window as typeof window & { failGeneratedArticleWrites?: boolean };
    target.failGeneratedArticleWrites = true;
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === "articles" && target.failGeneratedArticleWrites) {
        throw new DOMException("Simulated storage quota", "QuotaExceededError");
      }
      return original.apply(this, args);
    };
  });
  await dialog.getByRole("button", { name: "生成练习文章", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "重试保存的生成文章", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "重试保存", exact: true })).toBeEnabled();
  await expect(dialog.getByRole("status")).not.toContainText("已保存到我的文章库");
  expect(calls).toBe(1);
  await page.evaluate(() => {
    (window as typeof window & { failGeneratedArticleWrites?: boolean }).failGeneratedArticleWrites = false;
  });
  await dialog.getByRole("button", { name: "重试保存", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("已保存到我的文章库");
  expect(calls).toBe(1);
  await dialog.getByRole("button", { name: "留在当前页", exact: true }).click();
  await expect(page.getByRole("heading", { name: "重试保存的生成文章", exact: true })).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole("heading", { name: "重试保存的生成文章", exact: true })).toHaveCount(1);
});

test("旧生成地址替换为文章库，不自动开窗且浏览器返回不绕回旧页面", async ({ page }) => {
  await page.goto("/zh-CN/settings/");
  await page.goto("/zh-CN/generate/");
  await expect(page).toHaveURL(/\/articles\/$/);
  await expect(page.getByRole("heading", { name: "文章库", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "AI 生成文章", exact: true })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "主导航" }).getByRole("link", { name: "AI 文章", exact: true })).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(/\/settings\/$/);
});

test("自定义主题为空时提交禁用，篇幅单选组仍是一个可双向循环的 Tab 站", async ({ page }) => {
  await useTestKey(page);
  const { dialog } = await openLibraryGenerator(page);
  const submit = dialog.getByRole("button", { name: "生成练习文章", exact: true });
  await expect(submit).toBeEnabled();
  await dialog.getByLabel("文章主题", { exact: true }).selectOption("自定义");
  await expect(submit).toBeDisabled();
  const close = dialog.getByRole("button", { name: "关闭生成窗口", exact: true });
  for (const title of ["短篇", "中篇", "长篇"]) {
    const selected = dialog.getByRole("radio", { name: new RegExp(title) });
    await selected.check();
    await selected.focus();
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(selected).toBeFocused();
  }
});

for (const boundary of ["页面路径", "同页文章参数"] as const) {
  test(`浏览器返回或前进改变${boundary}时关闭页尾生成弹窗、中止请求并恢复滚动`, async ({ page }) => {
    await useTestKey(page);
    let calls = 0;
    await page.route(endpoint, () => { calls++; });
    await page.goto("/zh-CN/articles/");
    const libraryUrl = page.url();
    if (boundary === "页面路径") {
      await page.getByRole("navigation", { name: "主导航" }).getByRole("link", { name: "练习记录", exact: true }).click();
      await expect(page).toHaveURL(/\/history\/$/);
    } else {
      await page.getByRole("link").filter({
        has: page.getByRole("heading", { name: SAMPLE_ARTICLES[0].title, exact: true }),
      }).click();
      await expect(page).toHaveURL(new URL(`/zh-CN/articles/?id=${SAMPLE_ARTICLES[0].id}`, libraryUrl).href);
    }
    const destinationUrl = page.url();
    for (const [direction, expectedUrl] of [["back", libraryUrl], ["forward", destinationUrl]] as const) {
      const nextCall = calls + 1;
      const initialOverflow = await page.evaluate(() => document.body.style.overflow);
      await page.getByRole("contentinfo").getByRole("button", { name: "用 AI 写一篇", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "AI 生成文章", exact: true });
      await dialog.getByRole("button", { name: "生成练习文章", exact: true }).click();
      await expect.poll(() => calls).toBe(nextCall);
      const aborted = page.waitForEvent("requestfailed", { predicate: (request) => request.url() === endpoint });
      if (direction === "back") await page.goBack();
      else await page.goForward();
      await aborted;
      await expect(page).toHaveURL(expectedUrl);
      await expect(dialog).not.toBeVisible();
      await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe(initialOverflow);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
  });
}
