import { expect, test, type Page } from "@playwright/test";
import { SAMPLE_ARTICLES } from "../src/lib/articles";

const practiceModes = {
  kana: "五十音",
  sentence: "逐句练习",
  group: "分组练习",
  full: "整篇练习",
} as const;
type PracticeMode = keyof typeof practiceModes;

const progress = (page: Page) => page.getByLabel("输入进度", { exact: true });
const timer = (page: Page) => page.getByLabel("练习统计").locator(":scope > span").first();
const resume = (page: Page) => page.getByRole("button", { name: "继续练习", exact: true });
const typed = async (page: Page) => (await progress(page).locator("[data-romaji-typed]").allTextContents()).join("");
const pending = async (page: Page) => (await progress(page).locator("[data-romaji-pending]").allTextContents()).join("");

test.beforeEach(async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => {
    localStorage.setItem("pokotype:preferences:v1", JSON.stringify({
      version: 1,
      value: {
        groupIds: ["contracted-き"],
        showRomaji: true,
        keySoundEnabled: false,
        kanaSpeechEnabled: false,
        articleSpeechEnabled: false,
        articleSegmentSpeechEnabled: false,
      },
    }));
  });
});

async function start(page: Page, mode: PracticeMode = "full") {
  if (mode === "kana") {
    await page.goto("/zh-CN/");
    await page.getByRole("button", { name: "开始练习 20 题", exact: true }).click();
    await expect(page.getByRole("region", { name: "五十音打字练习", exact: true })).toBeFocused();
  } else {
    await page.goto(`/zh-CN/articles/?id=${SAMPLE_ARTICLES[0].id}`);
    await page.getByRole("radio", { name: practiceModes[mode], exact: true }).check();
    await page.getByRole("button", { name: "开始文章练习", exact: true }).click();
  }
  await expect(progress(page)).toBeVisible();
}

async function hidePage(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

async function returnToPage(page: Page) {
  await page.evaluate(() => {
    Reflect.deleteProperty(document, "hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
  });
}

for (const mode of Object.keys(practiceModes) as PracticeMode[]) {
  test(`${practiceModes[mode]} 切走停表，返回后第一键恢复并保留输入`, async ({ page }) => {
    await start(page, mode);
    const spelling = await pending(page);
    expect(spelling.length).toBeGreaterThanOrEqual(3);
    await page.keyboard.type(spelling[0]);
    await page.clock.fastForward(2_000);
    await expect(timer(page)).toHaveText("2 秒");

    for (const [index, cause] of ["blur", "hidden"].entries()) {
      if (cause === "blur") await page.evaluate(() => window.dispatchEvent(new Event("blur")));
      else await hidePage(page);
      await expect(resume(page)).toBeVisible();
      // Browsers can emit both events, or blur more than once, for one departure.
      await page.evaluate(() => window.dispatchEvent(new Event("blur")));
      const before = await typed(page);
      const pausedTime = await timer(page).textContent();
      await page.clock.fastForward(20_000);
      await expect(timer(page)).toHaveText(pausedTime!);
      await returnToPage(page);
      await page.clock.fastForward(5_000);
      await expect(timer(page)).toHaveText(pausedTime!);
      await expect(resume(page)).toBeVisible();

      await page.keyboard.type(spelling[index + 1]);
      await expect(resume(page)).toHaveCount(0);
      if (mode === "kana" && index === 1) {
        await expect(page.getByText("2 / 20", { exact: true })).toBeVisible();
      } else {
        await expect.poll(() => typed(page)).toBe(before + spelling[index + 1]);
        await page.clock.fastForward(1_000);
        await expect(timer(page)).toHaveText(`${3 + index} 秒`);
      }
    }
  });
}

test("主动暂停和查阅规则不会被切回页面或字母输入解除", async ({ page }) => {
  for (const cause of ["Escape", "button", "rules", "auto-Escape", "auto-rules"] as const) {
    await start(page);
    await page.keyboard.type("w");
    await page.clock.fastForward(2_000);
    if (cause.startsWith("auto-")) {
      await page.evaluate(() => window.dispatchEvent(new Event("blur")));
      await expect(resume(page)).toBeVisible();
      await returnToPage(page);
    }
    if (cause.endsWith("Escape")) await page.keyboard.press("Escape");
    else if (cause === "button") await page.getByRole("button", { name: "暂停", exact: true }).click();
    else {
      await page.getByRole("button", { name: "输入规则", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "输入规则", exact: true });
      await page.keyboard.type("a");
      await dialog.getByRole("button", { name: "关闭输入规则", exact: true }).click();
    }
    await expect(resume(page)).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await hidePage(page);
    await returnToPage(page);
    await expect.poll(() => typed(page)).toBe("w");
    const before = await typed(page);
    await page.keyboard.type("a");
    await page.clock.fastForward(20_000);
    await expect(resume(page)).toBeVisible();
    await expect.poll(() => typed(page)).toBe(before);
    await expect(timer(page)).toHaveText("2 秒");
    await resume(page).click();
    await page.keyboard.type("a");
    await expect.poll(() => typed(page)).toBe("wa");
  }
});

test("自动暂停忽略隐藏页、快捷键、组合输入、重复键与表单输入", async ({ page }) => {
  await start(page);
  await page.keyboard.type("w");
  await page.clock.fastForward(2_000);
  await hidePage(page);
  await page.keyboard.type("a");
  await expect(resume(page)).toBeVisible();
  await expect.poll(() => typed(page)).toBe("w");
  await returnToPage(page);
  await page.evaluate(() => {
    for (const options of [
      { ctrlKey: true }, { altKey: true }, { metaKey: true },
      { repeat: true }, { isComposing: true },
    ]) {
      document.body.dispatchEvent(new KeyboardEvent("keydown", {
        key: "a", bubbles: true, cancelable: true, ...options,
      }));
    }
    const prevented = new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true });
    prevented.preventDefault();
    document.body.dispatchEvent(prevented);
    for (const key of ["Tab", "Enter", " ", "1", "ArrowRight"]) {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    }
    for (const tag of ["input", "textarea", "select", "div"]) {
      const field = document.createElement(tag);
      if (tag === "div") field.contentEditable = "true";
      document.body.append(field);
      field.focus();
      field.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true }));
      field.remove();
    }
  });
  await page.clock.fastForward(20_000);
  await expect(resume(page)).toBeVisible();
  await expect.poll(() => typed(page)).toBe("w");
  await expect(timer(page)).toHaveText("2 秒");
  await page.keyboard.type("a");
  await expect(resume(page)).toHaveCount(0);
  await expect.poll(() => typed(page)).toBe("wa");
  await expect(page.getByLabel("练习统计")).toContainText(/100\s*%/);
});

test("自动暂停后的第一个错误字母恢复练习且只计一次错误", async ({ page }) => {
  await start(page);
  await page.keyboard.type("w");
  await page.clock.fastForward(2_000);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await returnToPage(page);
  await page.keyboard.type("q");
  await expect(resume(page)).toHaveCount(0);
  await expect.poll(() => typed(page)).toBe("w");
  await expect(page.getByRole("status")).toContainText("这个按键不匹配");
  await expect(page.getByLabel("练习统计")).toContainText(/50\s*%/);
  await page.clock.fastForward(1_000);
  await expect(timer(page)).toHaveText("3 秒");
  await page.keyboard.type("a");
  await expect.poll(() => typed(page)).toBe("wa");
  await expect(page.getByLabel("练习统计")).toContainText(/67\s*%/);
});
