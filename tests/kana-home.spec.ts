import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_PREFERENCES } from "../src/lib/storage";

const startButton = (page: Page, count = 20) =>
  page.getByRole("button", { name: `开始练习 ${count} 题`, exact: true });
const rangeLink = (page: Page) =>
  page.getByRole("button", { name: "调整练习范围", exact: true });
const summary = (page: Page) =>
  page.getByLabel("当前练习范围", { exact: true });

test("默认显示完整假名表，可滚动选音并用键盘往返开始区", async ({ page }) => {
  await page.goto("/zh-CN/");
  await expect(startButton(page)).toBeEnabled();
  await expect(summary(page)).toContainText("平假名");
  await expect(summary(page)).toContainText("清音");
  await expect(summary(page)).toContainText("46 个假名");
  await expect(
    page.getByLabel("显示罗马音提示", { exact: true }),
  ).toBeChecked();
  const range = page.getByRole("region", { name: "练习范围设置", exact: true });
  const heading = range.getByRole("heading", {
    name: "选择练习范围",
    exact: true,
  });
  const aRow = range.getByRole("button", { name: "あ行", exact: true });
  await expect(range).toBeVisible();
  await expect(range.getByRole("tablist", { name: "假名分类" })).toBeVisible();
  await expect(aRow).toBeVisible();
  await expect(aRow).toHaveAttribute("aria-pressed", "true");
  await expect(rangeLink(page)).not.toHaveAttribute("aria-expanded");

  // The full original card is in normal document flow, without an expand action.
  await page.mouse.wheel(0, 600);
  await heading.scrollIntoViewIfNeeded();
  await expect(heading).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await aRow.click();
  await expect(summary(page)).toContainText("清音（部分）");
  await expect(summary(page)).toContainText("41 个假名");
  await page.getByRole("button", { name: "返回开始练习", exact: true }).click();
  await expect(startButton(page)).toBeFocused();
  await expect(startButton(page)).toBeInViewport({ ratio: 1 });
  await expect(aRow).toHaveAttribute("aria-pressed", "false");

  await rangeLink(page).focus();
  await page.keyboard.press("Enter");
  await expect(heading).toBeFocused();
  await expect(heading).toBeInViewport({ ratio: 1 });
  await expect(aRow).toHaveAttribute("aria-pressed", "false");
});

test("返回开始区后按 Enter 开始，标题和操作栏不被浮动导航遮挡", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto("/zh-CN/");
  await rangeLink(page).click();
  await page.getByRole("button", { name: "返回开始练习", exact: true }).click();
  await expect(startButton(page)).toBeFocused();
  await expect(startButton(page)).toBeInViewport({ ratio: 1 });
  // Keyboard activation starts from the position restored by the return button.
  await page.keyboard.press("Enter");
  const practice = page.getByRole("region", {
    name: "五十音打字练习",
    exact: true,
  });
  await expect(practice).toBeFocused();
  const header = page.getByRole("banner");
  await header.evaluate(async (element) => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    await Promise.all(
      element
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
  for (const control of [
    practice.getByRole("heading", { name: "五十音练习", exact: true }),
    practice.getByRole("button", { name: "暂停", exact: true }),
  ]) {
    await expect(control).toBeInViewport({ ratio: 1 });
    const headerBounds = (await header.boundingBox())!;
    const controlBounds = (await control.boundingBox())!;
    expect(controlBounds.y).toBeGreaterThanOrEqual(
      headerBounds.y + headerBounds.height,
    );
  }
  await expect(page.getByLabel("输入进度")).toBeInViewport({ ratio: 1 });
});

test("范围摘要反映跨分类选择，空范围禁用开始并保留调整入口", async ({
  page,
}) => {
  await page.goto("/zh-CN/");
  await rangeLink(page).click();
  await page.getByRole("button", { name: "取消本类全选" }).click();
  await expect(startButton(page)).toBeDisabled();
  await expect(
    page.getByText("请至少选择一行假名", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "返回开始练习", exact: true }).click();
  await expect(rangeLink(page)).toBeFocused();
  await rangeLink(page).click();
  await page.getByRole("button", { name: "あ行", exact: true }).click();
  await page.getByRole("tab", { name: "浊音", exact: true }).click();
  await page.getByRole("button", { name: "が行", exact: true }).click();
  await expect(summary(page)).toContainText("清音（部分）");
  await expect(summary(page)).toContainText("浊音（部分）");
  await expect(summary(page)).toContainText("10 个假名");
  await page.getByRole("tab", { name: "半浊音", exact: true }).click();
  await page.getByRole("button", { name: "ぱ行", exact: true }).click();
  await expect(summary(page)).toContainText("半浊音");
  await expect(summary(page)).not.toContainText("半浊音（部分）");
  await expect(summary(page)).toContainText("15 个假名");
  await expect(startButton(page)).toBeEnabled();
});

test("已有设置恢复、即时保存并保留声音偏好，进入和退出练习恢复焦点", async ({
  page,
}) => {
  const preferences = {
    ...DEFAULT_PREFERENCES,
    script: "katakana" as const,
    count: 50 as const,
    showRomaji: false,
    groupIds: ["a", "ga"],
    keySoundEnabled: false,
    kanaSpeechEnabled: false,
    keySoundVolume: 0.4,
    speechVolume: 0.6,
    speechRate: 0.8 as const,
  };
  await page.addInitScript((preferences) => {
    if (!localStorage.getItem("pokotype:preferences:v1")) {
      localStorage.setItem(
        "pokotype:preferences:v1",
        JSON.stringify({ version: 1, value: preferences }),
      );
    }
  }, preferences);
  await page.goto("/zh-CN/");
  await expect(startButton(page, 50)).toBeEnabled();
  await expect(summary(page)).toContainText("片假名");
  await expect(summary(page)).toContainText("10 个假名");
  await expect(
    page.getByLabel("显示罗马音提示", { exact: true }),
  ).not.toBeChecked();
  const range = page.getByRole("region", { name: "练习范围设置", exact: true });
  await expect(range.getByRole("button", { name: /片假名/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await range.getByRole("button", { name: /平假名/ }).click();
  await page.getByRole("button", { name: "20 题", exact: true }).click();
  await page.getByLabel("显示罗马音提示", { exact: true }).check();
  await rangeLink(page).click();
  await page.getByRole("button", { name: "か行", exact: true }).click();
  await page.reload();
  await expect(startButton(page)).toBeEnabled();
  await expect(
    page.getByRole("region", { name: "练习范围设置", exact: true }),
  ).toBeVisible();
  await expect(summary(page)).toContainText("平假名");
  await expect(summary(page)).toContainText("15 个假名");
  await expect(
    page.getByLabel("显示罗马音提示", { exact: true }),
  ).toBeChecked();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("pokotype:preferences:v1")!).value,
    ),
  ).toEqual({
    ...preferences,
    script: "hiragana",
    count: 20,
    showRomaji: true,
    groupIds: ["a", "ga", "ka"],
  });
  await page.getByRole("button", { name: "返回开始练习", exact: true }).click();
  await startButton(page).click();
  await expect(
    page.getByRole("region", { name: "五十音打字练习", exact: true }),
  ).toBeFocused();
  await expect(page.getByLabel("输入进度")).toBeInViewport({ ratio: 1 });
  await page.getByRole("button", { name: "结束练习", exact: true }).click();
  await expect(startButton(page)).toBeFocused();
  await expect(startButton(page)).toBeInViewport({ ratio: 1 });
  await expect(
    page.getByRole("region", { name: "练习范围设置", exact: true }),
  ).toBeVisible();
  await expect(summary(page)).toContainText("15 个假名");
});

test("数据读取完成前不能误启动或修改默认设置", async ({ page }) => {
  await page.addInitScript(() => {
    const original = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (...args) {
      const request = original.apply(this, args);
      Object.defineProperty(request, "onsuccess", {
        configurable: true,
        set(
          handler: ((this: IDBOpenDBRequest, event: Event) => unknown) | null,
        ) {
          if (handler)
            request.addEventListener(
              "success",
              (event) => {
                (
                  window as typeof window & { releaseKanaData?: () => void }
                ).releaseKanaData = () => handler.call(request, event);
              },
              { once: true },
            );
        },
      });
      return request;
    };
  });
  await page.goto("/zh-CN/");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          typeof (window as typeof window & { releaseKanaData?: () => void })
            .releaseKanaData,
      ),
    )
    .toBe("function");
  await expect(page.getByRole("button", { name: /平假名/ })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "50 题", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByLabel("显示罗马音提示", { exact: true }),
  ).toBeDisabled();
  const range = page.getByRole("region", { name: "练习范围设置", exact: true });
  await expect(range).toBeVisible();
  for (const control of await range.getByRole("button").all()) {
    await expect(control).toBeDisabled();
  }
  for (const tab of await range.getByRole("tab").all()) {
    await expect(tab).toBeDisabled();
  }
  await expect(rangeLink(page)).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "正在读取设置…", exact: true }),
  ).toBeDisabled();
  await page.evaluate(() =>
    (window as typeof window & { releaseKanaData?: () => void })
      .releaseKanaData!(),
  );
  await expect(startButton(page)).toBeEnabled();
});

test("错项强化说明无记录原因，完成普通练习后可以直接强化", async ({ page }) => {
  await page.goto("/zh-CN/");
  await page.getByRole("button", { name: "错项强化", exact: true }).click();
  await expect(page.locator('.error[role="alert"]')).toContainText(
    "所选范围还没有练习记录",
  );
  await startButton(page).click();
  await expect(page.getByLabel("输入进度")).toBeVisible();
  for (let index = 0; index < 20; index++) {
    const remaining = await page
      .getByLabel("输入进度")
      .locator("[data-romaji-pending]")
      .allTextContents();
    await page.keyboard.type(remaining.join(""));
  }
  await expect(
    page.getByRole("heading", { name: "又向前了一小步" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "返回练习设置", exact: true }).click();
  await expect(startButton(page)).toBeFocused();
  await page.getByRole("button", { name: "错项强化", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "五十音打字练习", exact: true }),
  ).toBeFocused();
  await expect(page.getByLabel("输入进度")).toBeVisible();
});

for (const viewport of [
  { width: 1440, height: 800 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 768, height: 900 },
]) {
  test(`${viewport.width}×${viewport.height} 首屏呈现范围、快捷设置和主操作`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/zh-CN/");
    await expect(startButton(page)).toBeEnabled();
    for (const control of [
      summary(page),
      page.getByRole("button", { name: "50 题", exact: true }),
      page.getByLabel("显示罗马音提示", { exact: true }),
      startButton(page),
    ]) {
      await expect(control).toBeInViewport({ ratio: 1 });
    }
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    const bounds = (await startButton(page).boundingBox())!;
    expect(bounds.height).toBeGreaterThanOrEqual(60);
    expect(
      await startButton(page).evaluate((element) =>
        parseFloat(getComputedStyle(element).fontSize),
      ),
    ).toBeGreaterThanOrEqual(18);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

test("390px 手机上可滚动调整设置，返回后焦点回到范围入口且不横向溢出", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/zh-CN/");
  await expect(page.locator(".mobile-notice")).toBeVisible();
  await expect(startButton(page)).not.toBeVisible();
  await page.getByRole("button", { name: /片假名/ }).click();
  await rangeLink(page).click();
  await page.getByRole("button", { name: "取消本类全选" }).click();
  await page.getByRole("button", { name: "ア行", exact: true }).click();
  await page.getByRole("button", { name: "返回开始练习", exact: true }).click();
  await expect(rangeLink(page)).toBeFocused();
  await expect(summary(page)).toContainText("片假名");
  await expect(summary(page)).toContainText("5 个假名");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
