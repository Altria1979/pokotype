import { expect, test, type Locator, type Page } from "@playwright/test";
import { inflateSync } from "node:zlib";

const failedBlend = "*, *::before, *::after { background-blend-mode: normal !important; }";

function decodeScreenshot(png: Buffer) {
  let width = 0;
  let height = 0;
  let channels = 0;
  const chunks: Buffer[] = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      expect(data[8]).toBe(8);
      expect([2, 6]).toContain(data[9]);
      expect(data[12]).toBe(0);
      channels = data[9] === 6 ? 4 : 3;
    }
    if (type === "IDAT") chunks.push(data);
    offset += length + 12;
  }
  const rows = inflateSync(Buffer.concat(chunks));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  const paeth = (left: number, up: number, diagonal: number) => {
    const prediction = left + up - diagonal;
    const leftDistance = Math.abs(prediction - left);
    const upDistance = Math.abs(prediction - up);
    const diagonalDistance = Math.abs(prediction - diagonal);
    return leftDistance <= upDistance && leftDistance <= diagonalDistance
      ? left : upDistance <= diagonalDistance ? up : diagonal;
  };
  for (let y = 0; y < height; y++) {
    const row = y * (stride + 1);
    const filter = rows[row];
    if (filter > 4) throw new Error(`Unsupported PNG filter: ${filter}`);
    for (let x = 0; x < stride; x++) {
      const offset = y * stride + x;
      const left = x >= channels ? pixels[offset - channels] : 0;
      const up = y > 0 ? pixels[offset - stride] : 0;
      const diagonal = y > 0 && x >= channels ? pixels[offset - stride - channels] : 0;
      const prediction = filter === 1 ? left : filter === 2 ? up
        : filter === 3 ? Math.floor((left + up) / 2)
          : filter === 4 ? paeth(left, up, diagonal) : 0;
      pixels[offset] = (rows[row + 1 + x] + prediction) & 255;
    }
  }
  return { width, height, channels, pixels };
}

async function patch(page: Page, x: number, y: number) {
  const image = decodeScreenshot(await page.screenshot({ scale: "css" }));
  const colors: number[][] = [];
  for (let dy = 0; dy < 6; dy++) {
    for (let dx = 0; dx < 6; dx++) {
      const offset = ((Math.floor(y) + dy) * image.width + Math.floor(x) + dx) * image.channels;
      colors.push([...image.pixels.subarray(offset, offset + 3)]);
    }
  }
  return colors;
}

// Read the painted surface itself, rather than a body gutter or just its CSS.
// Every sample stays within an empty padding strip, away from text and borders.
async function expectStablePaper(page: Page, surface: Locator, name: string, options: {
  x?: number; y?: number; fixed?: boolean; base?: number[]; paintedBase?: number[];
} = {}) {
  await expect(surface, name).toBeVisible();
  if (!options.fixed) {
    await surface.scrollIntoViewIfNeeded();
    await surface.evaluate((element) => {
      if (!element.closest("dialog")) {
        window.scrollBy(0, element.getBoundingClientRect().top - 110);
      }
    });
  }
  await page.mouse.move(0, 0); // Selected rows have a deliberately plain hover state.
  const bounds = (await surface.boundingBox())!;
  const x = bounds.x + (options.x ?? 8);
  const y = bounds.y + (options.y ?? 24);
  const viewport = page.viewportSize()!;
  expect(x, name).toBeGreaterThanOrEqual(bounds.x);
  expect(y, name).toBeGreaterThanOrEqual(bounds.y);
  expect(x, name).toBeGreaterThanOrEqual(0);
  expect(y, name).toBeGreaterThanOrEqual(0);
  expect(x + 6, name).toBeLessThan(bounds.x + bounds.width);
  expect(y + 6, name).toBeLessThan(bounds.y + bounds.height);
  expect(x + 6, name).toBeLessThanOrEqual(viewport.width);
  expect(y + 6, name).toBeLessThanOrEqual(viewport.height);
  const base = await surface.evaluate((element) =>
    getComputedStyle(element).backgroundColor.match(/[\d.]+/g)!.slice(0, 3).map(Number),
  );
  if (options.base) expect(base, `${name} retains its own paper color`).toEqual(options.base);
  const normal = await patch(page, x, y);
  const disabled = await page.addStyleTag({ content: failedBlend });
  const fallback = await patch(page, x, y);
  await disabled.evaluate((element) => element.parentNode?.removeChild(element));
  const average = (colors: number[][]) => [0, 1, 2].map((channel) =>
    colors.reduce((sum, color) => sum + color[channel], 0) / colors.length,
  );
  const difference = Math.max(...normal.flatMap((color, index) =>
    color.map((channel, component) => Math.abs(channel - fallback[index][component])),
  ));
  expect.soft(difference, `${name}: pixels stay identical if background blending fails`).toBeLessThanOrEqual(2);
  expect.soft(new Set(fallback.map((color) => color.join(","))).size, `${name}: the grain remains visible`).toBeGreaterThan(1);
  const painted = average(fallback);
  for (const [index, value] of painted.entries()) {
    expect.soft(Math.abs(value - (options.paintedBase ?? base)[index]), `${name}: channel ${index} keeps the original pale paper tone`).toBeLessThan(8);
  }
  if (options.base) {
    for (const [left, right] of [[0, 1], [1, 2]]) {
      expect.soft(Math.sign(painted[left] - painted[right]), `${name}: painted hue preserves its color variant`)
        .toBe(Math.sign(options.base[left] - options.base[right]));
    }
  }
}

function modulePart(page: Page, module: string, part: string) {
  return page.locator(`[class*="${module}-module__"]:is([class$="__${part}"], [class*="__${part} "])`);
}

for (const width of [390, 1440]) {
  test.describe(`${width}px all paper surfaces survive failed background blending`, () => {
    test.use({ viewport: { width, height: 1000 }, isMobile: width === 390, hasTouch: width === 390 });
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      // The remote promotional badge does not participate in paper rendering.
      await page.route("https://api.producthunt.com/**", (route) => route.abort());
    });

    test("kana range and green selected rows", async ({ page }) => {
      await page.goto("/zh-CN/");
      await expect(page.getByRole("button", { name: "开始练习 20 题", exact: true })).toBeEnabled();
      await expectStablePaper(page, page.getByRole("region", { name: "练习范围设置", exact: true }), "kana range");
      const rows = modulePart(page, "KanaPractice", "rowSelected");
      await expectStablePaper(page, rows.first(), "selected kana row", { y: 8, base: [233, 238, 230] });
      await expectStablePaper(page, rows.last(), "selected contracted kana row", { y: 8, base: [233, 238, 230] });
    });

    test("floating navigation, mobile menu and footer call to action", async ({ page }) => {
      await page.goto("/zh-CN/");
      await page.evaluate(() => window.scrollTo(0, 200));
      const header = page.locator("header");
      await expect(header).toHaveClass(/__floating/);
      await expectStablePaper(page, header, "floating header", { x: 80, y: 6, fixed: true, paintedBase: [244, 241, 235] });
      if (width === 390) {
        await page.getByRole("button", { name: "导航菜单", exact: true }).click();
        await expectStablePaper(page, page.locator("#main-navigation"), "raised mobile navigation", { x: 5, y: 24, fixed: true, base: [255, 253, 248] });
        await page.getByRole("button", { name: "导航菜单", exact: true }).click();
      }
      await expectStablePaper(page, page.locator("section[aria-labelledby='next-practice-title']"), "footer CTA", { y: 60 });
    });

    test("generation modal and each length selection", async ({ page }) => {
      await page.goto("/zh-CN/articles/");
      await page.getByRole("button", { name: "生成新文章", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "AI 生成文章", exact: true });
      await expectStablePaper(page, dialog, "generation modal", { y: 40 });
      const choices = modulePart(page, "Generate", "lengthOptions").locator("label");
      for (let index = 0; index < 3; index++) {
        const choice = choices.nth(index);
        await choice.locator("input").check();
        await expectStablePaper(page, choice, `selected length ${index}`, { x: 8, y: 10, base: [233, 238, 230] });
        await expectStablePaper(page, choices.nth((index + 1) % 3), `plain length ${(index + 1) % 3}`, { x: 8, y: 10, base: [244, 241, 235] });
      }
    });

    test("practice panel, settings strip and both input rules surfaces", async ({ page }) => {
      await page.goto("/zh-CN/");
      await page.getByRole("button", { name: "开始练习 20 题", exact: true }).click();
      const stage = page.locator("[data-practice-stage]");
      await expect(stage).toBeVisible();
      await expectStablePaper(page, modulePart(page, "Practice", "practice").filter({ has: stage }), "practice panel", { y: 100 });
      const options = modulePart(page, "Practice", "options").filter({ has: page.locator("input") });
      if (width === 390) await page.getByText("练习设置", { exact: true }).click();
      await expectStablePaper(page, options, "practice options", { y: 8 });
      await page.getByRole("button", { name: "输入规则", exact: true }).click();
      const help = page.getByRole("dialog", { name: "输入规则", exact: true });
      await expectStablePaper(page, help, "input rules dialog", { y: 150 });
      await expectStablePaper(page, modulePart(page, "InputRulesHelp", "header"), "input rules header", { y: 12 });
    });

    test("settings, each API card, sound panel and model list modal", async ({ page }) => {
      await page.route("https://api.deepseek.com/models", (route) => route.fulfill({ json: { data: [{ id: "deepseek-test-paper" }] } }));
      await page.goto("/zh-CN/settings/");
      const panels = page.locator("main .panel");
      await expect(panels).toHaveCount(3);
      for (let index = 0; index < 3; index++) await expectStablePaper(page, panels.nth(index), `settings panel ${index}`);
      for (const provider of ["DeepSeek", "阿里百炼"]) {
        await expectStablePaper(page, page.getByRole("region", { name: `${provider} API 密钥`, exact: true }), `${provider} API card`);
      }
      const card = page.getByRole("region", { name: "DeepSeek API 密钥", exact: true });
      await card.getByLabel("DeepSeek API 密钥", { exact: true }).fill("test-only-paper-model-list-key");
      await card.getByRole("button", { name: "检查连接", exact: true }).click();
      await card.getByRole("button", { name: "查看模型列表", exact: true }).click();
      await expectStablePaper(page, page.getByRole("dialog", { name: "DeepSeek 模型列表", exact: true }), "model list dialog", { y: 80 });
    });

    test("article cards, three cover colors, reading footer and history", async ({ page }) => {
      await page.goto("/zh-CN/articles/");
      const cards = modulePart(page, "Articles", "articleCard");
      await expect(cards).toHaveCount(3);
      const covers = modulePart(page, "Articles", "cover");
      const bases = [[237, 234, 225], [232, 238, 228], [244, 231, 220]];
      for (let index = 0; index < 3; index++) {
        await expectStablePaper(page, cards.nth(index), `article card ${index}`, { y: 60 });
        await expectStablePaper(page, covers.nth(index), `article cover ${index}`, { y: 12, base: bases[index] });
      }
      await page.goto("/zh-CN/articles/?id=sample-morning");
      await expectStablePaper(page, modulePart(page, "Articles", "readingPanel"), "article reading panel", { y: 120 });
      await expectStablePaper(page, modulePart(page, "Articles", "readingFooter"), "reading footer", { y: 8 });
      await page.goto("/zh-CN/history/");
      await expectStablePaper(page, page.locator("main .panel"), "empty history panel", { y: 100 });
      await page.goto("/zh-CN/practice/");
      await expectStablePaper(page, page.locator("main .panel"), "missing practice session panel", { y: 100 });
    });
  });
}
