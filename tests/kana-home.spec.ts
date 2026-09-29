import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_PREFERENCES } from "../src/lib/storage";

const startButton = (page: Page, count = 20) =>
  page.getByRole("button", { name: `开始练习 ${count} 题`, exact: true });
const rangeLink = (page: Page) =>
  page.getByRole("button", { name: "调整练习范围", exact: true });
const summary = (page: Page) =>
  page.getByLabel("当前练习范围", { exact: true });
const category = (page: Page, name: string) =>
  page.getByRole("region", { name, exact: true });

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
  await expect(range.getByRole("tablist")).toHaveCount(0);
  await expect(range.getByRole("heading", { level: 3 })).toHaveText([
    "清音", "浊音", "半浊音", "拗音",
  ]);
  for (const [name, rows, selected] of [
    ["清音", 10, true],
    ["浊音", 4, false],
    ["半浊音", 1, false],
    ["拗音", 12, false],
  ] as const) {
    const section = category(page, name);
    await expect(section).toBeVisible();
    await expect(section.locator(`button[aria-pressed="${selected}"]`)).toHaveCount(rows);
    await expect(section.locator("button[aria-pressed]")).toHaveCount(rows);
  }
  await expect(aRow).toBeVisible();
  await expect(aRow).toHaveAttribute("aria-pressed", "true");
  await expect(rangeLink(page)).not.toHaveAttribute("aria-expanded");

  // The full original card is in normal document flow, without an expand action.
  await page.mouse.wheel(0, 600);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await heading.scrollIntoViewIfNeeded();
  await expect(heading).toBeInViewport({ ratio: 1 });
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

test("四类假名下方常显罗马音，关闭练习提示和平片切换不会隐藏或改变读音", async ({
  page,
}) => {
  await page.goto("/zh-CN/");
  await expect(startButton(page)).toBeEnabled();
  const range = page.getByRole("region", { name: "练习范围设置", exact: true });
  const readings = range.locator('[lang="ja-Latn"]');
  await expect(readings).toHaveCount(107);
  await page.getByLabel("显示罗马音提示", { exact: true }).uncheck();

  const examples = [
    ["し", "シ", "shi"],
    ["ち", "チ", "chi"],
    ["つ", "ツ", "tsu"],
    ["ふ", "フ", "fu"],
    ["ん", "ン", "n"],
    ["が", "ガ", "ga"],
    ["ぢ", "ヂ", "di"],
    ["づ", "ヅ", "du"],
    ["ぱ", "パ", "pa"],
    ["きゃ", "キャ", "kya"],
    ["しゃ", "シャ", "sha"],
    ["ちゃ", "チャ", "cha"],
    ["ぢゃ", "ヂャ", "dya"],
  ];
  for (const script of [0, 1] as const) {
    if (script === 1) {
      await range.getByRole("button", { name: /片假名/ }).click();
    }
    for (const example of examples) {
      const cell = range.locator('[lang="ja"] > span').filter({
        has: page.getByText(example[script], { exact: true }),
      });
      const reading = cell.locator('[lang="ja-Latn"]');
      await expect(reading).toHaveText(example[2]);
      await expect(reading).toBeVisible();
    }
    await expect(readings).toHaveCount(107);
    await expect(page.getByLabel("显示罗马音提示", { exact: true })).not.toBeChecked();
  }
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
  await category(page, "清音").getByRole("button", { name: "取消本类全选" }).click();
  await expect(startButton(page)).toBeDisabled();
  await expect(
    page.getByText("请至少选择一行假名", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "返回开始练习", exact: true }).click();
  await expect(rangeLink(page)).toBeFocused();
  await rangeLink(page).click();
  await page.getByRole("button", { name: "あ行", exact: true }).click();
  await page.getByRole("button", { name: "が行", exact: true }).click();
  await expect(summary(page)).toContainText("清音（部分）");
  await expect(summary(page)).toContainText("浊音（部分）");
  await expect(summary(page)).toContainText("10 个假名");
  await page.getByRole("button", { name: "ぱ行", exact: true }).click();
  await expect(summary(page)).toContainText("半浊音");
  await expect(summary(page)).not.toContainText("半浊音（部分）");
  await expect(summary(page)).toContainText("15 个假名");
  await expect(startButton(page)).toBeEnabled();
});

test("各区全选只影响本区，部分选择可补齐，全局全选包含 107 个假名", async ({
  page,
}) => {
  await page.goto("/zh-CN/");
  const voiced = category(page, "浊音");
  const contracted = category(page, "拗音");
  await voiced.getByRole("button", { name: "が行", exact: true }).click();
  await expect(summary(page)).toContainText("51 个假名");
  await voiced.getByRole("button", { name: "全选本类", exact: true }).click();
  await expect(summary(page)).toContainText("66 个假名");
  await expect(voiced.getByRole("button", { pressed: true })).toHaveCount(4);
  await expect(category(page, "清音").getByRole("button", { pressed: true })).toHaveCount(10);
  await expect(contracted.locator('button[aria-pressed="false"]')).toHaveCount(12);
  await voiced.getByRole("button", { name: "取消本类全选", exact: true }).click();
  await expect(summary(page)).toContainText("46 个假名");
  await contracted.getByRole("button", { name: "全选本类", exact: true }).click();
  await expect(summary(page)).toContainText("82 个假名");
  await expect(contracted.getByRole("button", { pressed: true })).toHaveCount(12);
  await page.getByRole("button", { name: "选择全部分类", exact: true }).click();
  await expect(summary(page)).toContainText("107 个假名");
  await expect(summary(page)).not.toContainText("部分");
  for (const name of ["清音", "浊音", "半浊音", "拗音"]) {
    const section = category(page, name);
    await expect(section.locator('button[aria-pressed="false"]')).toHaveCount(0);
    await expect(section.getByRole("button", { name: "取消本类全选", exact: true })).toBeVisible();
  }
});

test("拗音与浊音跨类混选可切换片假名、刷新恢复并完成选定范围练习", async ({
  page,
}) => {
  await page.goto("/zh-CN/");
  await category(page, "清音").getByRole("button", { name: "取消本类全选" }).click();
  await category(page, "浊音").getByRole("button", { name: "が行", exact: true }).click();
  const contracted = category(page, "拗音");
  await contracted.getByRole("button", { name: "きゃ行", exact: true }).click();
  await expect(summary(page)).toContainText("浊音（部分）");
  await expect(summary(page)).toContainText("拗音（部分）");
  await expect(summary(page)).toContainText("8 个假名");
  await page.getByRole("button", { name: /片假名/ }).click();
  await expect(contracted.getByRole("button", { name: "キャ行", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(category(page, "浊音").getByRole("button", { name: "ガ行", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(category(page, "清音").getByRole("button", { name: "ア行", exact: true })).toBeVisible();
  await expect(category(page, "半浊音").getByRole("button", { name: "パ行", exact: true })).toBeVisible();
  await page.reload();
  await expect(startButton(page)).toBeEnabled();
  await expect(summary(page)).toContainText("片假名");
  await expect(summary(page)).toContainText("8 个假名");
  await expect(contracted.getByRole("button", { name: "キャ行", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() =>
    JSON.parse(localStorage.getItem("pokotype:preferences:v1")!).value.groupIds,
  )).toEqual(["ga", "contracted-き"]);
  await page.getByRole("button", { name: "返回开始练习", exact: true }).click();
  await expect(startButton(page)).toBeFocused();
  await page.keyboard.press("Enter");
  const practice = page.getByRole("region", { name: "五十音打字练习", exact: true });
  await expect(practice).toBeFocused();
  for (let index = 0; index < 20; index++) {
    await expect(practice.locator('div[lang="ja"]')).toHaveText(/^(ガ|ギ|グ|ゲ|ゴ|キャ|キュ|キョ)$/);
    const remaining = await page.getByLabel("输入进度").locator("[data-romaji-pending]").allTextContents();
    await page.keyboard.type(remaining.join(""));
  }
  await expect(page.getByRole("heading", { name: "又向前了一小步" })).toBeVisible();
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
  await expect(range.getByRole("region")).toHaveCount(4);
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

test("首页各模块与页面同宽，所有屏幕的首屏内容均上下排列并水平居中", async ({
  page,
}) => {
  for (const width of [1440, 1920, 2560, 1024, 768, 390, 320]) {
    await test.step(`${width}px 的模块边界与内容布局`, async () => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/zh-CN/");
      await expect(rangeLink(page)).toBeEnabled();
      await page.evaluate(() => document.fonts.ready);
      const main = page.getByRole("main");
      const mainBox = (await main.boundingBox())!;
      const gutter = width > 1200 ? 64 : width > 700 ? 32 : 24;
      expect(mainBox.x).toBeCloseTo(gutter, 0);
      expect(mainBox.width).toBeCloseTo(width - 2 * gutter, 0);

      const launch = page.getByRole("region", { name: "五十音练习", exact: true });
      const footer = page.getByRole("contentinfo");
      for (const block of [
        page.getByRole("banner"),
        launch,
        page.getByRole("region", { name: "练习范围设置", exact: true }),
        main.locator('[class*="__metrics"]'),
        main.locator('[class*="__lowerLinks"]'),
        footer,
        footer.locator('[class*="__footerMeta"]'),
      ]) {
        await expect(block).toBeVisible();
        const box = (await block.boundingBox())!;
        expect(box.x).toBeCloseTo(mainBox.x, 0);
        expect(box.width).toBeCloseTo(mainBox.width, 0);
      }

      const intro = launch.locator('[class*="launchIntro"]');
      const setup = launch.locator('[class*="launchSetup"]');
      await expect(intro.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(intro.locator('[class*="bigKana"]')).toBeVisible();
      await expect(setup.getByLabel("当前练习范围", { exact: true })).toBeVisible();
      await expect(setup.getByRole("button", { name: "50 题", exact: true })).toBeVisible();
      const introBox = (await intro.boundingBox())!;
      const setupBox = (await setup.boundingBox())!;
      const center = mainBox.x + mainBox.width / 2;
      expect(introBox.x).toBeCloseTo(mainBox.x, 0);
      expect(introBox.width).toBeCloseTo(mainBox.width, 0);
      expect(setupBox.x).toBeCloseTo(mainBox.x, 0);
      expect(setupBox.width).toBeCloseTo(mainBox.width, 0);
      expect(setupBox.y).toBeGreaterThanOrEqual(introBox.y + introBox.height);
      for (const text of [intro.getByRole("heading", { level: 1 }), summary(page)]) {
        const textCenter = await text.evaluate((element) => {
          const range = document.createRange();
          range.selectNodeContents(element);
          const box = range.getBoundingClientRect();
          return box.x + box.width / 2;
        });
        expect(textCenter).toBeCloseTo(center, 0);
      }
      const exampleCenter = await intro.locator('[class*="previewCard"]').evaluate((element) => {
        const boxes = [...element.children].map((child) => child.getBoundingClientRect());
        return (Math.min(...boxes.map((box) => box.left)) + Math.max(...boxes.map((box) => box.right))) / 2;
      });
      expect(exampleCenter).toBeCloseTo(center, 0);

      await expect(startButton(page)).toBeVisible();
      await expect(page.getByRole("button", { name: "错项强化", exact: true })).toBeVisible();
      if (width > 700) {
        await expect(startButton(page)).toBeInViewport({ ratio: 1 });
      }
      const startBox = (await startButton(page).boundingBox())!;
      expect(startBox.x + startBox.width / 2).toBeCloseTo(center, 0);
      expect(startBox.width).toBeCloseTo(width > 900 ? 320 : mainBox.width, 0);
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    });
  }
});

test("390px 手机上可滚动调整设置，返回后焦点回到开始按钮且不横向溢出", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/zh-CN/");
  await expect(startButton(page)).toBeVisible();
  await page.getByRole("button", { name: /片假名/ }).click();
  await rangeLink(page).click();
  await category(page, "清音").getByRole("button", { name: "取消本类全选" }).click();
  await page.getByRole("button", { name: "ア行", exact: true }).click();
  const contracted = category(page, "拗音");
  await contracted.scrollIntoViewIfNeeded();
  await page.evaluate(() => document.fonts.ready);
  const rows = contracted.locator("button[aria-pressed]");
  await expect(rows).toHaveCount(12);
  for (const row of await rows.all()) {
    const kana = row.locator('[lang="ja"] > span');
    await expect(kana).toHaveCount(3);
    const rowBounds = (await row.boundingBox())!;
    for (const cell of await kana.all()) {
      const lines = cell.locator(":scope > span");
      await expect(lines).toHaveCount(2);
      await expect(cell.locator('[lang="ja-Latn"]')).toBeVisible();
      const [glyph, reading] = await lines.evaluateAll((elements) =>
        elements.map((element) => {
          const box = element.getBoundingClientRect();
          const text = document.createRange();
          text.selectNodeContents(element);
          const textBox = text.getBoundingClientRect();
          return {
            left: box.left,
            right: box.right,
            top: box.top,
            bottom: box.bottom,
            width: box.width,
            height: box.height,
            textWidth: textBox.width,
            textHeight: textBox.height,
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
          };
        }),
      );
      expect(reading.top).toBeGreaterThanOrEqual(glyph.bottom - 1);
      for (const geometry of [glyph, reading]) {
        expect(geometry.width).toBeGreaterThanOrEqual(geometry.textWidth - 1);
        expect(geometry.height).toBeGreaterThanOrEqual(geometry.textHeight - 1);
        expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
        expect(geometry.left).toBeGreaterThanOrEqual(rowBounds.x);
        expect(geometry.right).toBeLessThanOrEqual(rowBounds.x + rowBounds.width);
        expect(geometry.top).toBeGreaterThanOrEqual(rowBounds.y);
        expect(geometry.bottom).toBeLessThanOrEqual(rowBounds.y + rowBounds.height);
      }
    }
  }
  await contracted.getByRole("button", { name: "キャ行", exact: true }).click();
  await page.getByRole("button", { name: "返回开始练习", exact: true }).click();
  await expect(startButton(page)).toBeFocused();
  await expect(summary(page)).toContainText("片假名");
  await expect(summary(page)).toContainText("8 个假名");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

for (const { locale, title, categories } of [
  {
    locale: "en",
    title: "Practice range settings",
    categories: ["Basic kana", "Voiced kana", "Semi-voiced kana", "Contracted kana"],
  },
  {
    locale: "ja",
    title: "練習範囲の設定",
    categories: ["清音", "濁音", "半濁音", "拗音"],
  },
]) {
  test(`${locale} 的四个分区按本地化标题命名并保持顺序`, async ({ page }) => {
    await page.goto(`/${locale}/`);
    const range = page.getByRole("region", { name: title, exact: true });
    await expect(range.getByRole("heading", { level: 3 })).toHaveText(categories);
    for (const name of categories) {
      await expect(category(page, name)).toBeVisible();
    }
  });
}
