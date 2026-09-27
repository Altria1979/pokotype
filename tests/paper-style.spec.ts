import { expect, test, type Locator, type Page } from "@playwright/test";
import { inflateSync } from "node:zlib";

async function light(art: Locator) {
  return art.evaluate((element) => {
    const gradient = getComputedStyle(element, "::before").backgroundImage;
    const center = gradient.match(/at ([\d.]+)% ([\d.]+)%/);
    const circle = gradient.match(
      /^radial-gradient\((?:circle )?([\d.]+)px(?: at |,)/,
    );
    // Chrome omits the default center when serializing a centered gradient.
    const defaultCenter =
      gradient.startsWith("radial-gradient(") && !gradient.includes(" at ");
    const stop = gradient.match(/ ([\d.]+)%\)$/);
    return {
      gradient,
      x: center ? Number(center[1]) : defaultCenter ? 50 : NaN,
      y: center ? Number(center[2]) : defaultCenter ? 50 : NaN,
      radius: circle ? Number(circle[1]) : NaN,
      stop: stop ? Number(stop[1]) : NaN,
    };
  });
}

async function expectCenter(art: Locator, x: number, y: number) {
  await expect
    .poll(async () => {
      const actual = await light(art);
      return Math.hypot(actual.x - x, actual.y - y);
    })
    .toBeLessThan(0.2);
}

async function expectRadius(art: Locator, factor: number, stop: number) {
  await expect
    .poll(async () => {
      const bounds = (await art.boundingBox())!;
      return Math.abs(
        (await light(art)).radius -
          Math.min(bounds.width, bounds.height) * factor,
      );
    })
    .toBeLessThan(0.2);
  expect((await light(art)).stop).toBe(stop);
}

async function expectLayerDepths(art: Locator) {
  const bounds = (await art.boundingBox())!;
  const { x, y } = await light(art);
  const displacement = Math.min(bounds.width, bounds.height) * 0.08;
  const baseX = (x / 100 - 0.5) * displacement;
  const baseY = (y / 100 - 0.5) * displacement;
  const transforms = await art
    .locator(":scope > div > span")
    .evaluateAll((elements) =>
      elements.map((element) => {
        const matrix = new DOMMatrixReadOnly(
          getComputedStyle(element).transform,
        );
        return {
          x: matrix.m41,
          y: matrix.m42,
          rotation: (Math.atan2(matrix.m12, matrix.m11) * 180) / Math.PI,
        };
      }),
    );
  const depths = [-1, -0.7, -1.2, -0.8, -0.9];
  const rotations = [0, -35, 0, 35, 0];
  expect(transforms).toHaveLength(depths.length);
  for (const [index, transform] of transforms.entries()) {
    expect(Math.abs(transform.x - baseX * depths[index])).toBeLessThan(0.2);
    expect(Math.abs(transform.y - baseY * depths[index])).toBeLessThan(0.2);
    expect(transform.rotation).toBeCloseTo(rotations[index], 3);
  }
}

async function waitForVisibleArt(art: Locator) {
  await expect(art).toBeInViewport({ ratio: 1 });
  // Give IntersectionObserver a frame to enable newly mounted artwork.
  await art.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function moveTo(page: Page, art: Locator, x: number, y: number) {
  await waitForVisibleArt(art);
  const bounds = (await art.boundingBox())!;
  await page.mouse.move(
    bounds.x + bounds.width * x,
    bounds.y + bounds.height * y,
  );
}

async function openDesktopArt(page: Page) {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/zh-CN/");
  await expect(
    page.getByRole("button", { name: "开始练习 20 题", exact: true }),
  ).toBeEnabled();
  const art = page.locator("[data-paper-art]").first();
  await waitForVisibleArt(art);
  return art;
}

async function expectStillAcrossFrames(art: Locator) {
  const layers = art.locator(":scope > div > span");
  const baseline = await layers.evaluateAll((elements) =>
    elements.map((element) => getComputedStyle(element).transform),
  );
  for (let frame = 0; frame < 8; frame++) {
    await art.evaluate(
      () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
    const actual = await light(art);
    expect(Math.hypot(actual.x - 50, actual.y - 50)).toBeLessThan(0.2);
    expect(
      await layers.evaluateAll((elements) =>
        elements.map((element) => getComputedStyle(element).transform),
      ),
    ).toEqual(baseline);
  }
}

async function pixel(page: Page, x: number, y: number) {
  const png = await page.screenshot({
    clip: { x: Math.floor(x), y: Math.floor(y), width: 1, height: 1 },
    scale: "css",
  });
  const chunks: Buffer[] = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      expect([data.readUInt32BE(0), data.readUInt32BE(4)]).toEqual([1, 1]);
      expect(data[8]).toBe(8);
      expect([2, 6]).toContain(data[9]); // Chromium screenshots use RGB or RGBA.
      expect(data[12]).toBe(0);
    }
    if (type === "IDAT") chunks.push(data);
    offset += length + 12;
  }
  // For the first pixel of the first row every PNG filter predictor is zero.
  const row = inflateSync(Buffer.concat(chunks));
  return [row[1], row[2], row[3]];
}

function colorDistance(a: number[], b: number[]) {
  return Math.hypot(...a.map((value, index) => value - b[index]));
}

for (const viewport of [
  { width: 1440, height: 800 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
]) {
  test(`${viewport.width}×${viewport.height} 首屏可直接开始五十音练习`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/zh-CN/");
    const start = page.getByRole("button", {
      name: "开始练习 20 题",
      exact: true,
    });
    await expect(start).toBeEnabled();
    await expect(start).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });
}

test("页面实际加载可解码的 256px 纸纹图片", async ({ page }) => {
  const response = page.waitForResponse(
    (item) => new URL(item.url()).pathname === "/paper-grain.png",
  );
  await page.goto("/zh-CN/");
  expect((await response).ok()).toBe(true);
  const size = await page.evaluate(async () => {
    const image = new Image();
    image.src = "/paper-grain.png";
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  });
  expect(size).toEqual({ width: 256, height: 256 });
});

test("圆形光圈覆盖完整插画范围，越界钳制到边缘并在悬停时扩大", async ({
  page,
}) => {
  const art = await openDesktopArt(page);
  await expectCenter(art, 50, 50);
  await expectRadius(art, 0.56, 55);

  for (const [x, y] of [
    [0.15, 0.25],
    [0.85, 0.75],
  ]) {
    await moveTo(page, art, x, y);
    await expectCenter(art, x * 100, y * 100);
    await expectRadius(art, 0.72, 50);
    await expectLayerDepths(art);
  }

  // Leaving the element still follows the window pointer; it does not recenter.
  await page.mouse.move(1, 1);
  await expectCenter(art, 0, 0);
  await expectRadius(art, 0.56, 55);
  const viewport = page.viewportSize()!;
  await page.mouse.move(viewport.width - 1, viewport.height - 1);
  await expectCenter(art, 100, 100);
  await expectRadius(art, 0.56, 55);
});

test("圆形遮罩真实揭示彩色图案，远离该点时恢复纸面", async ({ page }) => {
  const art = await openDesktopArt(page);
  const capsule = art.locator(":scope > div > span").first();
  const bounds = (await capsule.boundingBox())!;
  const point = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
  const paper = await art.evaluate((element) =>
    getComputedStyle(element)
      .backgroundColor.match(/[\d.]+/g)!
      .slice(0, 3)
      .map(Number),
  );

  await page.mouse.move(1, 1);
  await expectCenter(art, 0, 0);
  const hidden = await pixel(page, point.x, point.y);
  expect(colorDistance(hidden, paper)).toBeLessThan(40);

  const artBounds = (await art.boundingBox())!;
  await page.mouse.move(point.x, point.y);
  await expectCenter(
    art,
    ((point.x - artBounds.x) / artBounds.width) * 100,
    ((point.y - artBounds.y) / artBounds.height) * 100,
  );
  const revealed = await pixel(page, point.x, point.y);
  expect(colorDistance(revealed, hidden)).toBeGreaterThan(60);
  expect(colorDistance(revealed, paper)).toBeGreaterThan(60);
});

test("离开文档、失焦、页面隐藏和插画离屏均复位并停止追随", async ({ page }) => {
  const art = await openDesktopArt(page);
  await moveTo(page, art, 0.85, 0.75);
  await expectCenter(art, 85, 75);
  await page
    .locator("html")
    .dispatchEvent("pointerleave", { pointerType: "mouse" });
  await expectCenter(art, 50, 50);
  await expectStillAcrossFrames(art);

  await moveTo(page, art, 0.2, 0.3);
  await expectCenter(art, 20, 30);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expectCenter(art, 50, 50);
  await expectStillAcrossFrames(art);

  await moveTo(page, art, 0.8, 0.7);
  await expectCenter(art, 80, 70);
  // Deterministically deliver the browser visibility boundary without relying
  // on whether a headless runner marks a second tab as backgrounded.
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  try {
    await expectCenter(art, 50, 50);
    await page.mouse.move(1, 1);
    await expectStillAcrossFrames(art);
  } finally {
    await page.evaluate(() => {
      Reflect.deleteProperty(document, "hidden");
      document.dispatchEvent(new Event("visibilitychange"));
    });
  }

  await moveTo(page, art, 0.85, 0.75);
  await expectCenter(art, 85, 75);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(art).not.toBeInViewport();
  await expectCenter(art, 50, 50);
  await page.mouse.move(1, 1);
  await expectStillAcrossFrames(art);
});

test("光圈随插画尺寸缩放，导航卸载后新插画从中央正常开始", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const art = await openDesktopArt(page);
  await page.mouse.move(1, 1);
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1100, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await waitForVisibleArt(art);
    await expectRadius(art, 0.56, 55);
    await moveTo(page, art, 0.8, 0.3);
    await expectRadius(art, 0.72, 50);
    await page.mouse.move(1, 1);
  }

  await moveTo(page, art, 0.8, 0.3);
  await page
    .getByRole("navigation", { name: "主导航" })
    .getByRole("link", { name: "我的文章库", exact: true })
    .click();
  await expect(page.locator("[data-paper-art]")).toHaveCount(0);
  await page.mouse.move(1, 1);
  await page
    .getByRole("navigation", { name: "主导航" })
    .getByRole("link", { name: "五十音练习", exact: true })
    .click();
  await waitForVisibleArt(art);
  await expectCenter(art, 50, 50);
  await moveTo(page, art, 0.2, 0.8);
  await expectCenter(art, 20, 80);
  expect(errors).toEqual([]);
});

test("视口重排但插画尺寸不变时，光圈按原鼠标位置更新", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const art = await openDesktopArt(page);
  const before = (await art.boundingBox())!;
  const pointer = {
    x: before.x + before.width * 0.7,
    y: before.y + before.height * 0.4,
  };
  await page.mouse.move(pointer.x, pointer.y);
  await expectCenter(art, 70, 40);
  await expectRadius(art, 0.72, 50);

  // Keep the mouse at the same client coordinates: only the page layout moves.
  await page.setViewportSize({ width: 1920, height: 1000 });
  const after = (await art.boundingBox())!;
  expect(after.width).toBeCloseTo(before.width, 1);
  expect(after.height).toBeCloseTo(before.height, 1);
  expect(after.x).not.toBe(before.x);
  const relativeX = (pointer.x - after.x) / after.width;
  const relativeY = (pointer.y - after.y) / after.height;
  const inside =
    relativeX >= 0 && relativeX <= 1 && relativeY >= 0 && relativeY <= 1;
  await expectCenter(
    art,
    Math.max(0, Math.min(1, relativeX)) * 100,
    Math.max(0, Math.min(1, relativeY)) * 100,
  );
  await expectRadius(art, inside ? 0.72 : 0.56, inside ? 50 : 55);
});

test("鼠标主输入的桌面也忽略触摸和笔事件，真实鼠标仍能移动光圈", async ({
  page,
}) => {
  const art = await openDesktopArt(page);
  expect(
    await page.evaluate(
      () => matchMedia("(hover: hover) and (pointer: fine)").matches,
    ),
  ).toBe(true);
  await expectStillAcrossFrames(art);
  const bounds = (await art.boundingBox())!;
  for (const pointerType of ["touch", "pen"]) {
    await art.dispatchEvent("pointermove", {
      pointerType,
      clientX: bounds.x + bounds.width * 0.85,
      clientY: bounds.y + bounds.height * 0.75,
    });
    await expectStillAcrossFrames(art);
  }
  await moveTo(page, art, 0.85, 0.75);
  await expectCenter(art, 85, 75);
});

test("减少动态效果复位为静态中央遮罩，恢复后可再次追随", async ({ page }) => {
  const art = await openDesktopArt(page);
  await moveTo(page, art, 0.85, 0.75);
  await expectCenter(art, 85, 75);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expectCenter(art, 50, 50);
  await page.mouse.move(1, 1);
  await moveTo(page, art, 0.2, 0.3);
  await expectStillAcrossFrames(art);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await moveTo(page, art, 0.8, 0.7);
  await expectCenter(art, 80, 70);
});

for (const scenario of [
  {
    title: "390px 窄屏",
    viewport: { width: 390, height: 844 },
    hasTouch: false,
  },
  {
    title: "宽屏触控设备",
    viewport: { width: 1024, height: 900 },
    hasTouch: true,
  },
]) {
  test.describe(scenario.title, () => {
    test.use({ viewport: scenario.viewport, hasTouch: scenario.hasTouch });
    test("记录空状态的光圈和图案保持静止", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.goto("/zh-CN/history/");
      await expect(
        page.getByRole("heading", { name: "你的进步，将从这里开始" }),
      ).toBeVisible();
      const art = page.locator("[data-paper-art]").first();
      await art.scrollIntoViewIfNeeded();
      await moveTo(page, art, 0.85, 0.75);
      await expectStillAcrossFrames(art);
      await page.mouse.move(1, 1);
      await expectStillAcrossFrames(art);
    });
  });
}
