import { test, expect, type Page } from "@playwright/test";
import { SAMPLE_ARTICLES } from "../src/lib/articles";

async function completeCurrentSentence(page: Page) {
  const progress = page.getByLabel("输入进度");
  const remaining = (
    await progress.locator("[data-romaji-pending]").allTextContents()
  ).join("");
  await page.keyboard.type(remaining);
}

test("五十音完整练习、提示开关焦点、暂停及刷新恢复", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/zh-CN/");
  await expect(
    page.getByRole("button", { name: "开始练习 20 题" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "调整练习范围" }).click();
  await page.getByRole("button", { name: "取消本类全选" }).click();
  await page.getByRole("button", { name: "あ行", exact: true }).click();
  await page.getByRole("button", { name: "返回开始练习", exact: true }).click();
  await page.getByRole("button", { name: "开始练习 20 题" }).click();
  await page
    .getByRole("checkbox", { name: "罗马音提示", exact: true })
    .uncheck();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "继续练习" })).toBeVisible();
  await page.getByRole("button", { name: "继续练习" }).click();
  await page.getByRole("checkbox", { name: "罗马音提示", exact: true }).check();
  await page.keyboard.press("x");
  await expect(page.getByRole("status")).toContainText("这个按键不匹配");
  for (let i = 0; i < 20; i++) await completeCurrentSentence(page);
  await expect(
    page.getByRole("heading", { name: "又向前了一小步" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "练习记录", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: /假名\s*五十音 · 自由练习/ }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("cell", { name: /假名\s*五十音 · 自由练习/ }),
  ).toBeVisible();
  await expect(page.getByRole("cell", { name: "95.2%" })).toBeVisible();
  await page.getByRole("link", { name: "继续练习", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: "开始练习 20 题", exact: true })).toBeEnabled();
  expect(errors).toEqual([]);
});

test("示例文章练习、修正读音、保存副本、删除", async ({ page }) => {
  await page.goto("/zh-CN/articles/");
  await page
    .locator(`a[href="/zh-CN/articles/?id=${SAMPLE_ARTICLES[0].id}"]`)
    .filter({
      has: page.getByRole("heading", {
        name: SAMPLE_ARTICLES[0].title,
        exact: true,
      }),
    })
    .click();
  await page.getByRole("radio", { name: "逐句练习", exact: true }).check();
  await page.getByRole("button", { name: "开始文章练习" }).click();
  await page.getByRole("checkbox", { name: "整句听读", exact: true }).uncheck();
  for (let i = 0; i < SAMPLE_ARTICLES[0].sentences.length; i++)
    await completeCurrentSentence(page);
  await expect(
    page.getByRole("heading", { name: "又向前了一小步" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "返回练习设置" }).click();
  await page.getByRole("button", { name: "修改标题与读音" }).click();
  await page.getByLabel("文章标题").fill("我的练习副本");
  await page.getByLabel("第 1 句第 1 段读音", { exact: true }).fill("abc");
  await page.getByRole("button", { name: "保存为副本" }).click();
  await expect(page.locator('.error[role="alert"]')).toBeVisible();
  await page
    .getByLabel("第 1 句第 1 段读音", { exact: true })
    .fill(SAMPLE_ARTICLES[0].sentences[0].segments[0].reading);
  await page.getByRole("button", { name: "保存为副本" }).click();
  await expect(
    page.getByRole("heading", { name: "我的练习副本", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "我的练习副本", exact: true }),
  ).toBeVisible();
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "删除文章" }).click();
  await expect(
    page.getByRole("heading", { name: "文章库", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "我的练习副本", exact: true }),
  ).toHaveCount(0);
});

test("用户密钥、模拟生成与清除；API 错误不覆盖文章", async ({ page }) => {
  await page.goto("/zh-CN/settings/");
  const keyCard = page.getByRole("region", { name: "DeepSeek API 密钥", exact: true });
  await keyCard
    .getByLabel("DeepSeek API 密钥", { exact: true })
    .fill("test-only-not-a-real-credential");
  await keyCard.getByRole("button", { name: "保存密钥", exact: true }).click();
  await expect(keyCard.getByRole("status")).toContainText("密钥已保存");
  let calls = 0;
  await page.route(
    "https://api.deepseek.com/chat/completions",
    async (route) => {
      calls++;
      expect(route.request().headers().authorization).toBe(
        "Bearer test-only-not-a-real-credential",
      );
      const body = route.request().postDataJSON();
      expect(body.model).toBe("deepseek-flash");
      if (calls === 1)
        await route.fulfill({
          json: {
            choices: [
              {
                finish_reason: "stop",
                message: {
                  content: JSON.stringify({
                    title: "测试生成文章",
                    sentences: SAMPLE_ARTICLES[1].sentences,
                  }),
                },
              },
            ],
          },
        });
      else
        await route.fulfill({
          status: 402,
          json: { error: { message: "do not echo raw body" } },
        });
    },
  );
  await page.getByRole("link", { name: "我的文章库", exact: true }).click();
  await page.getByRole("button", { name: "生成新文章", exact: true }).click();
  await page.getByRole("button", { name: "生成练习文章" }).click();
  const dialog = page.getByRole("dialog", { name: "AI 生成文章", exact: true });
  await expect(
    dialog.getByRole("heading", { name: "测试生成文章", exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "留在当前页", exact: true }).click();
  await page.getByRole("button", { name: "生成新文章", exact: true }).click();
  await page.getByRole("button", { name: "生成练习文章" }).click();
  await expect(dialog.locator('.error[role="alert"]')).toContainText("余额");
  expect(calls).toBe(2);
  await dialog.getByRole("button", { name: "关闭生成窗口", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "测试生成文章", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "设置", exact: true }).click();
  await keyCard.getByRole("button", { name: "清除密钥", exact: true }).click();
  await page.reload();
  await expect(
    keyCard.getByRole("button", { name: "清除密钥", exact: true }),
  ).toBeDisabled();
  await page.getByRole("link", { name: "我的文章库", exact: true }).click();
  await page.getByRole("button", { name: "生成新文章", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "生成练习文章" }),
  ).toBeDisabled();
});

test("桌面和手机布局、页面直达与控制台", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const width of [1440, 1920, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const path of [
      "/zh-CN/",
      "/zh-CN/generate/",
      "/zh-CN/articles/",
      "/zh-CN/history/",
      "/zh-CN/settings/",
    ]) {
      await page.goto(path);
      await expect(page.locator("h1")).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
    }
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/zh-CN/");
  const menu = page.getByRole("button", { name: "导航菜单" });
  await menu.click();
  await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible();
  expect(
    await menu.evaluate(
      (element) => getComputedStyle(element).transitionDuration,
    ),
  ).toBe("0s");
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
  await expect(
    page.getByRole("button", { name: "开始练习 20 题" }),
  ).not.toBeVisible();
  expect(errors).toEqual([]);
});
