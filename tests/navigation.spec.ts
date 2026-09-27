import { expect, test } from "@playwright/test";

const destinations = [
  { label: "五十音练习", path: "/zh-CN/" },
  { label: "我的文章库", path: "/zh-CN/articles/" },
  { label: "练习记录", path: "/zh-CN/history/" },
  { label: "设置", path: "/zh-CN/settings/" },
];

test("桌面顶部导航可切换所有页面，只有当前入口标记为所在页面", async ({
  page,
  baseURL,
}) => {
  await page.goto("/zh-CN/");
  const navigation = page.getByRole("navigation", { name: "主导航" });
  await expect(navigation).toBeVisible();
  await expect(navigation.getByRole("link")).toHaveCount(destinations.length);
  await expect(
    page.getByRole("button", { name: "导航菜单", exact: true }),
  ).not.toBeVisible();

  for (const { label, path } of destinations) {
    const link = navigation.getByRole("link", { name: label, exact: true });
    await link.click();
    await expect(page).toHaveURL(new URL(path, baseURL).href);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(link).toHaveAttribute("aria-current", "page");
    await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
  }
});

test("390px 导航支持键盘、Esc 焦点返回、当前页关闭与浏览器返回", async ({
  page,
  baseURL,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/zh-CN/");
  const menu = page.getByRole("button", {
    name: "导航菜单",
    exact: true,
    includeHidden: true,
  });
  const navigation = page.locator('nav[aria-label="主导航"]');
  await expect(menu).toBeVisible();
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(navigation).not.toBeVisible();
  await expect(menu).toHaveAttribute("aria-controls", /\S+/);
  expect(await menu.getAttribute("aria-controls")).toBe(
    await navigation.getAttribute("id"),
  );

  // A collapsed disclosure must not leave its links in the Tab sequence.
  await menu.focus();
  await page.keyboard.press("Tab");
  expect(
    await navigation.evaluate((element) =>
      element.contains(document.activeElement),
    ),
  ).toBe(false);

  await menu.focus();
  await page.keyboard.press("Enter");
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await expect(navigation).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(
    navigation.getByRole("link", { name: "五十音练习", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    navigation.getByRole("link", { name: "我的文章库", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(navigation).not.toBeVisible();
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toBeFocused();

  await page.keyboard.press("Space");
  await expect(navigation).toBeVisible();
  const settings = navigation.getByRole("link", { name: "设置", exact: true });
  await settings.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/settings\/$/);
  await expect(navigation).not.toBeVisible();
  await expect(menu).toHaveAttribute("aria-expanded", "false");

  // Changing history while the menu is open must not reopen an older menu state.
  await menu.click();
  await expect(navigation).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(new URL("/zh-CN/", baseURL).href);
  await expect(navigation).not.toBeVisible();
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await menu.click();
  const home = navigation.getByRole("link", {
    name: "五十音练习",
    exact: true,
  });
  await expect(home).toHaveAttribute("aria-current", "page");
  await home.click();
  await expect(navigation).not.toBeVisible();
  await expect(menu).toHaveAttribute("aria-expanded", "false");
});

test("手机菜单打开后切换桌面再返回手机时保持收起", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/zh-CN/");
  const menu = page.getByRole("button", {
    name: "导航菜单",
    exact: true,
    includeHidden: true,
  });
  const navigation = page.locator('nav[aria-label="主导航"]');
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await expect(navigation).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(menu).not.toBeVisible();
  await expect(navigation).toBeVisible();
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(navigation.getByRole("link")).toHaveCount(destinations.length);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(menu).toBeVisible();
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(navigation).not.toBeVisible();
});

test("桌面和手机导航在滚动后收成浮动胶囊，正文位置保持稳定", async ({
  page,
}) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/zh-CN/settings/");
    const header = page.getByRole("banner");
    const main = page.getByRole("main");
    const contentTop = await main.evaluate(
      (element) => element.getBoundingClientRect().top + window.scrollY,
    );
    await expect(header).toHaveAttribute("data-floating", "false");

    await page.evaluate(() => window.scrollTo(0, 16));
    await expect(header).toHaveAttribute("data-floating", "false");
    await page.evaluate(() => window.scrollTo(0, 100));
    await expect(header).toHaveAttribute("data-floating", "true");
    await expect
      .poll(async () => Math.round((await header.boundingBox())!.y))
      .toBe(12);
    await expect
      .poll(async () => (await header.boundingBox())!.width)
      .toBeLessThanOrEqual(1160);
    expect(
      await main.evaluate(
        (element) => element.getBoundingClientRect().top + window.scrollY,
      ),
    ).toBeCloseTo(contentTop, 1);
    await expect(header).toBeInViewport({ ratio: 1 });

    if (width === 390) {
      const menu = page.getByRole("button", { name: "导航菜单", exact: true });
      await menu.click();
      await expect(
        page.getByRole("navigation", { name: "主导航" }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(menu).toBeFocused();
      await expect(menu).toHaveAttribute("aria-expanded", "false");
    }

    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(header).toHaveAttribute("data-floating", "false");
    await expect
      .poll(async () => Math.round((await header.boundingBox())!.y))
      .toBe(0);
  }
});

test("减少动态效果时导航不做形变动画，页尾入口有效且练习时收起", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/zh-CN/");
  const header = page.getByRole("banner");
  await page.evaluate(() => window.scrollTo(0, 100));
  await expect(header).toHaveAttribute("data-floating", "true");
  expect(
    await header.evaluate(
      (element) => getComputedStyle(element).transitionDuration,
    ),
  ).toBe("0s");
  const footer = page.getByRole("contentinfo");
  const originalUrl = page.url();
  await footer.getByRole("button", { name: "用 AI 写一篇", exact: true }).click();
  await expect(page).toHaveURL(originalUrl);
  const dialog = page.getByRole("dialog", { name: "AI 生成文章", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "关闭生成窗口", exact: true }).click();
  await footer.getByRole("link", { name: "试试示例文章", exact: true }).click();
  await expect(page).toHaveURL(/\/articles\/\?id=sample-morning$/);
  await expect(
    page.getByRole("button", { name: "开始文章练习" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "开始文章练习" }).click();
  await expect(page.getByLabel("输入进度")).toBeVisible();
  await expect(
    footer.getByRole("button", { name: "用 AI 写一篇", exact: true }),
  ).not.toBeVisible();
  await expect(
    footer.getByRole("link", { name: "试试示例文章", exact: true }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "结束练习" }).click();
  await expect(
    footer.getByRole("link", { name: "试试示例文章", exact: true }),
  ).toBeVisible();
});

test("667×300 矮屏菜单可用 Tab 到达末项，内部滚动后 Esc 返回按钮", async ({
  page,
}) => {
  await page.setViewportSize({ width: 667, height: 300 });
  await page.goto("/zh-CN/");
  const menu = page.getByRole("button", { name: "导航菜单", exact: true });
  const navigation = page.getByRole("navigation", { name: "主导航" });
  await menu.focus();
  await page.keyboard.press("Enter");
  await expect(navigation).toBeVisible();

  for (const { label } of destinations) {
    await page.keyboard.press("Tab");
    const link = navigation.getByRole("link", { name: label, exact: true });
    await expect(link).toBeFocused();
    await expect(link).toBeInViewport({ ratio: 1 });
  }
  expect(
    await navigation.evaluate((element) => element.scrollTop),
  ).toBeGreaterThan(0);
  const settings = navigation.getByRole("link", { name: "设置", exact: true });
  const lastLinkBox = (await settings.boundingBox())!;
  expect(lastLinkBox.y + lastLinkBox.height).toBeLessThanOrEqual(300);
  await page.keyboard.press("Escape");
  await expect(navigation).not.toBeVisible();
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toBeFocused();
});

test("跳到主要内容将焦点交给正文，首行不被固定导航遮挡", async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/zh-CN/");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "跳到主要内容", exact: true });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    const main = page.getByRole("main");
    await expect(main).toBeFocused();
    const firstLine = main.locator(".eyebrow").first();
    await expect(firstLine).toBeInViewport({ ratio: 1 });
    await expect
      .poll(async () => {
        const headerBox = (await page.getByRole("banner").boundingBox())!;
        const firstLineBox = (await firstLine.boundingBox())!;
        return firstLineBox.y - (headerBox.y + headerBox.height);
      })
      .toBeGreaterThanOrEqual(0);
  }
});
