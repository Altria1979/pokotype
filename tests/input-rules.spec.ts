import { expect, test, type Page } from "@playwright/test";
import { SAMPLE_ARTICLES } from "../src/lib/articles";

const articlePath = `/zh-CN/articles/?id=${SAMPLE_ARTICLES[0].id}`;

async function checkKeyboardHelp(page: Page) {
  const trigger = page.getByRole("button", { name: "输入规则", exact: true });
  const dialog = page.getByRole("dialog", { name: "输入规则", exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "关闭输入规则" }),
  ).toBeFocused();
  for (const key of [
    "Tab",
    "Tab",
    "Tab",
    "Shift+Tab",
    "Shift+Tab",
    "Shift+Tab",
  ]) {
    await page.keyboard.press(key);
    expect(
      await dialog.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
}

test("五十音设置、文章预览和练习均可用键盘打开规则并返回焦点", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/zh-CN/");
  await checkKeyboardHelp(page);
  await page.goto(articlePath);
  await checkKeyboardHelp(page);
  await page.getByRole("radio", { name: "逐句练习", exact: true }).check();
  await page.getByRole("button", { name: "开始文章练习" }).click();
  await checkKeyboardHelp(page);
  await expect(page.getByRole("button", { name: "继续练习" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("查阅规则冻结计时、按键进度与统计，关闭后手动继续", async ({ page }) => {
  await page.clock.install();
  await page.goto(articlePath);
  await page.getByRole("radio", { name: "逐句练习", exact: true }).check();
  await page.getByRole("button", { name: "开始文章练习" }).click();
  const progress = page.getByLabel("输入进度");
  const stats = page.getByLabel("练习统计");
  const trigger = page.getByRole("button", { name: "输入规则", exact: true });
  const dialog = page.getByRole("dialog", { name: "输入规则", exact: true });
  await page.keyboard.type("w");
  await expect(
    page.getByText("按照假名书写形式，输入这一句", { exact: true }),
  ).toBeVisible();
  await page.clock.fastForward(5_000);
  await trigger.click();
  await expect(dialog).toBeVisible();
  const pausedProgress = await progress.textContent();
  const pausedStats = await stats.textContent();
  await page.keyboard.type("atashihaq");
  await page.clock.fastForward(60_000);
  await expect(progress).toHaveText(pausedProgress!);
  await expect(stats).toHaveText(pausedStats!);
  await dialog.getByRole("button", { name: "关闭输入规则" }).click();
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("button", { name: "继续练习" })).toBeVisible();
  await page.keyboard.type("atashihaq");
  await page.clock.fastForward(60_000);
  await expect(progress).toHaveText(pausedProgress!);
  await expect(stats).toHaveText(pausedStats!);
  await page.getByRole("button", { name: "继续练习" }).click();
  await page.keyboard.type("atashiha");
  await expect(progress.locator("[data-romaji-typed]").first()).toHaveText(
    "watashiha",
  );
  await page.clock.fastForward(2_000);
  await expect(stats).not.toHaveText(pausedStats!);
  await expect(page.getByRole("status")).not.toContainText("不匹配");
});

test("首次输入前和已暂停时查阅规则都保持暂停，五十音继续后正常作答", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/zh-CN/");
  await page.getByRole("button", { name: "开始练习 20 题" }).click();
  const progress = page.getByLabel("输入进度");
  const stats = page.getByLabel("练习统计");
  await expect(progress).toBeVisible();
  const initialProgress = await progress.textContent();
  const initialStats = await stats.textContent();
  await checkKeyboardHelp(page);
  await page.clock.fastForward(60_000);
  await expect(progress).toHaveText(initialProgress!);
  await expect(stats).toHaveText(initialStats!);
  await expect(page.getByRole("button", { name: "继续练习" })).toBeVisible();
  await checkKeyboardHelp(page);
  await page.clock.fastForward(60_000);
  await expect(page.getByRole("button", { name: "继续练习" })).toBeVisible();
  await expect(stats).toHaveText(initialStats!);
  await page.getByRole("button", { name: "继续练习" }).click();
  await page.keyboard.type(
    (await progress.locator("[data-romaji-pending]").textContent())!,
  );
  await expect(page.getByText("2 / 20", { exact: true })).toBeVisible();
});

test("规则在桌面和 390px 手机上内部滚动，关闭按钮可见且无横向溢出", async ({
  page,
}) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 740 });
    await page.goto(articlePath);
    await page.getByRole("button", { name: "输入规则", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "输入规则", exact: true });
    await expect(dialog).toBeVisible();
    const box = (await dialog.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(680);
    expect(box.x).toBeGreaterThan(0);
    expect(box.x + box.width).toBeLessThan(width);
    const scrollCount = await dialog.evaluate((element) => {
      const scrollAreas = [
        element,
        ...element.querySelectorAll<HTMLElement>("*"),
      ].filter((node) => {
        const overflow = getComputedStyle(node).overflowY;
        return (
          /auto|scroll/.test(overflow) && node.scrollHeight > node.clientHeight
        );
      });
      for (const node of scrollAreas) node.scrollTop = node.scrollHeight;
      return scrollAreas.length;
    });
    expect(scrollCount).toBeGreaterThan(0);
    const close = dialog.getByRole("button", { name: "关闭输入规则" });
    await expect(close).toBeInViewport({ ratio: 1 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    expect(
      await dialog.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await close.click();
    await expect(dialog).not.toBeVisible();
  }
});
