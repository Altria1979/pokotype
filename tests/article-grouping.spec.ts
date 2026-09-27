import { test, expect } from "@playwright/test";
import { SAMPLE_ARTICLES } from "../src/lib/articles";

test("罗马音分组跟随实际拼写，高亮对应日文，空格无需输入", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`/zh-CN/articles/?id=${SAMPLE_ARTICLES[0].id}`);
  await page.getByRole("radio", { name: "逐句练习", exact: true }).check();
  await page.getByRole("button", { name: "开始文章练习" }).click();
  await page.getByRole("checkbox", { name: "整句听读", exact: true }).uncheck();
  const progress = page.getByLabel("输入进度");
  // Leave the sound checkbox before checking Space as a practice key.
  await progress.click();
  const groups = progress.locator("[data-romaji-group]");
  const current = progress.locator('[aria-current="step"]');
  const currentJapanese = page.locator('ruby[aria-current="step"]');
  await expect(groups).toHaveCount(3);
  await expect(groups.first()).toHaveText("watasiha");
  await expect(current).toHaveAttribute("data-romaji-group", "0");
  await expect(currentJapanese).toContainText("私は");

  const boxes = await groups.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      };
    }),
  );
  for (let i = 1; i < boxes.length; i++) {
    expect(
      boxes[i].left - boxes[i - 1].right >= 12 ||
        boxes[i].top >= boxes[i - 1].bottom,
    ).toBe(true);
  }

  // A longer accepted spelling must move only this group's pending hint.
  await page.keyboard.type("watash");
  await expect(groups.first().locator("[data-romaji-typed]")).toHaveText(
    "watash",
  );
  await expect(groups.first().locator("[data-romaji-pending]")).toHaveText(
    "iha",
  );
  await page.keyboard.type("q");
  await expect(page.getByRole("status")).toContainText("这个按键不匹配");
  await expect(groups.first()).toHaveText("watashiha");
  await page.keyboard.type("iha");
  await expect(current).toHaveAttribute("data-romaji-group", "1");
  await expect(currentJapanese).toContainText("毎朝七時に起きて、");
  await page.keyboard.press("Space");
  await expect(page.getByRole("status")).toContainText("无需空格");
  await page.keyboard.type("maiasa");
  await expect(current.locator("[data-romaji-typed]")).toHaveText("maiasa");

  await page
    .getByRole("checkbox", { name: "罗马音提示", exact: true })
    .uncheck();
  for (const text of await progress
    .locator("[data-romaji-pending]")
    .allTextContents()) {
    expect(text).toBe("···");
  }
  await expect(groups.first()).toHaveText("watashiha");
  await page.getByRole("checkbox", { name: "假名读音", exact: true }).uncheck();
  await expect(page.locator("ruby rt")).toHaveCount(0);
  await expect(currentJapanese).toHaveText("毎朝七時に起きて、");
  await page.getByRole("checkbox", { name: "罗马音提示", exact: true }).check();

  await page.keyboard.press("Escape");
  const pending = (
    await progress.locator("[data-romaji-pending]").allTextContents()
  ).join("");
  await page.keyboard.type(pending);
  await expect(current.locator("[data-romaji-typed]")).toHaveText("maiasa");
  await page.getByRole("button", { name: "继续练习" }).click();
  for (let i = 0; i < SAMPLE_ARTICLES[0].sentences.length; i++) {
    await page.keyboard.type(
      (await progress.locator("[data-romaji-pending]").allTextContents()).join(
        "",
      ),
    );
  }
  await expect(
    page.getByRole("heading", { name: "又向前了一小步" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("长罗马音片段在窄桌面和手机宽度下换行，不超出练习区", async ({ page }) => {
  await page.goto(`/zh-CN/articles/?id=${SAMPLE_ARTICLES[0].id}`);
  await page.getByRole("button", { name: "修改标题与读音" }).click();
  await page
    .getByLabel("第 1 句第 1 段读音", { exact: true })
    .fill("し".repeat(80));
  await page.getByRole("button", { name: "保存为副本" }).click();
  await page.getByRole("radio", { name: "逐句练习", exact: true }).check();
  await page.getByRole("button", { name: "开始文章练习" }).click();
  for (const width of [1440, 800, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const progress = page.getByLabel("输入进度");
    await expect(progress).toBeVisible();
    const contained = await progress.evaluate((element) => {
      const container = element.getBoundingClientRect();
      return (
        [...element.querySelectorAll("[data-romaji-group]")].every((group) => {
          const rect = group.getBoundingClientRect();
          return (
            rect.left >= container.left - 1 &&
            rect.right <= container.right + 1 &&
            group.scrollWidth <= group.clientWidth + 1
          );
        }) && document.documentElement.scrollWidth <= innerWidth
      );
    });
    expect(contained).toBe(true);
  }
});
