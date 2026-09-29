import { expect, test } from "@playwright/test";

const releases = "https://github.com/Altria1979/pokotype/releases";

for (const copy of [
  { locale: "zh-CN", download: "桌面版下载 · macOS / Windows", start: "开始练习", exit: "结束练习" },
  { locale: "en", download: "Desktop downloads · macOS / Windows", start: "Start practice", exit: "End practice" },
  { locale: "ja", download: "デスクトップ版 · macOS / Windows", start: "練習を始める", exit: "練習を終了" },
]) {
  test(`${copy.locale} 桌面下载入口可聚焦、指向 Releases 且练习时隐藏`, async ({ page }) => {
    await page.goto(`/${copy.locale}/`);
    const download = page.getByRole("link", { name: copy.download, exact: true });
    await expect(download).toBeVisible();
    await expect(download).toHaveAttribute("href", releases);
    await expect(download).toHaveAttribute("target", "_blank");
    await expect(download).toHaveAttribute("rel", "noopener noreferrer");
    await download.focus();
    await expect(download).toBeFocused();

    await page.getByRole("button", { name: new RegExp(`^${copy.start}`) }).click();
    await expect(download).toBeHidden();
    await page.getByRole("button", { name: copy.exit, exact: true }).click();
    await expect(download).toBeVisible();

    await page.setViewportSize({ width: 320, height: 800 });
    await download.scrollIntoViewIfNeeded();
    await expect(download).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
