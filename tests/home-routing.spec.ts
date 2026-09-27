import { expect, test, type Page, type Route } from "@playwright/test";
import type { PracticeRecord } from "../src/lib/storage";

const startButton = (page: Page, count = 20) =>
  page.getByRole("button", { name: `开始练习 ${count} 题`, exact: true });

async function startSession(page: Page, count = 20) {
  await startButton(page, count).click();
  await expect(page).toHaveURL(/\/practice\/\?session=[0-9a-f-]+$/);
  expect(new URL(page.url()).searchParams.get("session")).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  const practice = page.getByRole("region", { name: "五十音打字练习", exact: true });
  await expect(practice).toBeVisible();
  await expect(practice).toBeFocused();
  await expect(page.getByLabel("输入进度")).toBeVisible();
  return page.url();
}

async function completeSession(page: Page) {
  for (let index = 0; index < 20; index++) {
    await expect(page.getByText(`${index + 1} / 20`, { exact: true })).toBeVisible();
    const remaining = (await page.getByLabel("输入进度").locator("[data-romaji-pending]").allTextContents()).join("");
    expect(remaining.length).toBeGreaterThan(0);
    await page.keyboard.type(remaining);
  }
  await expect(page.getByRole("heading", { name: "又向前了一小步", exact: true })).toBeVisible();
}

async function records(page: Page): Promise<PracticeRecord[]> {
  return page.evaluate(() => new Promise<PracticeRecord[]>((resolve, reject) => {
    const request = indexedDB.open("pokotype-v1", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const read = database.transaction("records").objectStore("records").getAll();
      read.onerror = () => { database.close(); reject(read.error); };
      read.onsuccess = () => {
        database.close();
        resolve(read.result.map((entry) => entry.value));
      };
    };
  }));
}

test("开始练习 push 独立会话，返回保留设置和焦点，旧会话失效且可连续开启新会话", async ({ page, baseURL }) => {
  await page.goto("/zh-CN/");
  await page.getByRole("button", { name: /片假名/ }).click();
  await page.getByRole("button", { name: "50 题", exact: true }).click();
  await page.getByLabel("显示罗马音提示", { exact: true }).uncheck();
  const firstUrl = await startSession(page, 50);
  const navigation = page.getByRole("navigation", { name: "主导航" });
  await expect(navigation.getByRole("link")).toHaveCount(4);
  await expect(navigation.getByRole("link", { name: "五十音练习", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
  await expect(page.getByRole("region", { name: "练习范围设置", exact: true })).toHaveCount(0);
  await expect(page.getByText("1 / 50", { exact: true })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(new URL("/zh-CN/", baseURL).href);
  await expect(startButton(page, 50)).toBeFocused();
  await expect(page.getByLabel("当前练习范围", { exact: true })).toContainText("片假名");
  await expect(page.getByLabel("显示罗马音提示", { exact: true })).not.toBeChecked();
  await page.goForward();
  await expect(page).toHaveURL(new URL("/zh-CN/", baseURL).href);
  await expect(startButton(page, 50)).toBeEnabled();
  await expect(page.getByRole("region", { name: "五十音打字练习", exact: true })).toHaveCount(0);

  const secondUrl = await startSession(page, 50);
  expect(secondUrl).not.toBe(firstUrl);
  await page.getByRole("button", { name: "结束练习", exact: true }).click();
  await expect(page).toHaveURL(new URL("/zh-CN/", baseURL).href);
  await expect(startButton(page, 50)).toBeFocused();
  const thirdUrl = await startSession(page, 50);
  expect(thirdUrl).not.toBe(secondUrl);
  await navigation.getByRole("link", { name: "我的文章库", exact: true }).click();
  await expect(page).toHaveURL(/\/articles\/$/);
  await page.goBack();
  await expect(page).toHaveURL(new URL("/zh-CN/", baseURL).href);
  await expect(startButton(page, 50)).toBeEnabled();
  expect(await records(page)).toEqual([]);
});

for (const exitMethod of ["返回练习设置", "浏览器返回"] as const) {
  test(`结果保留会话地址且只保存一次，${exitMethod}后前进不会重新打开已完成会话`, async ({ page, baseURL }) => {
    await page.goto("/zh-CN/");
    const sessionUrl = await startSession(page);
    await page.keyboard.press("q");
    await expect(page.getByRole("status")).toContainText("这个按键不匹配");
    await completeSession(page);
    await expect(page).toHaveURL(sessionUrl);
    await expect.poll(async () => (await records(page)).length).toBe(1);
    const saved = (await records(page))[0];
    expect(saved).toMatchObject({ mode: "kana", title: "五十音 · 自由练习", errors: 1 });
    await page.keyboard.type("aiueo");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(sessionUrl);
    expect(await records(page)).toEqual([saved]);

    if (exitMethod === "浏览器返回") await page.goBack();
    else await page.getByRole("button", { name: "返回练习设置", exact: true }).click();
    await expect(page).toHaveURL(new URL("/zh-CN/", baseURL).href);
    await expect(startButton(page)).toBeFocused();
    await page.goForward();
    await expect(page).toHaveURL(new URL("/zh-CN/", baseURL).href);
    await expect(startButton(page)).toBeEnabled();
    expect(await records(page)).toEqual([saved]);
    await page.getByRole("link", { name: "练习记录", exact: true }).click();
    await expect(page.getByRole("row")).toHaveCount(2);
    await expect(page.getByRole("cell", { name: /假名\s*五十音 · 自由练习/ })).toBeVisible();
    await page.getByRole("link", { name: "继续练习", exact: true }).click();
    await expect(page).toHaveURL(new URL("/zh-CN/", baseURL).href);
  });
}

test("无会话或无效 session 的静态直达 replace 返回原首页", async ({ page, baseURL }) => {
  for (const path of [
    "/zh-CN/practice/",
    "/zh-CN/practice/?session=invalid",
    "/zh-CN/practice/?session=11111111-1111-4111-8111-111111111111",
  ]) {
    await page.goto("/zh-CN/settings/");
    const response = await page.goto(path);
    expect(response?.ok()).toBe(true);
    await expect(page).toHaveURL(new URL("/zh-CN/", baseURL).href);
    await expect(startButton(page)).toBeEnabled();
    await expect(page.getByRole("region", { name: "五十音打字练习", exact: true })).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL(/\/settings\/$/);
  }
});

test("会话地址不能在新标签中恢复，刷新练习返回首页并保留偏好", async ({ page, context, baseURL }) => {
  await page.goto("/zh-CN/");
  await page.getByRole("button", { name: "50 题", exact: true }).click();
  const sessionUrl = await startSession(page, 50);
  const otherPage = await context.newPage();
  try {
    await otherPage.goto(sessionUrl);
    await expect(otherPage).toHaveURL(new URL("/zh-CN/", baseURL).href);
    await expect(startButton(otherPage, 50)).toBeEnabled();
  } finally {
    await otherPage.close();
  }
  await page.reload();
  await expect(page).toHaveURL(new URL("/zh-CN/", baseURL).href);
  await expect(startButton(page, 50)).toBeEnabled();
  await expect(page.getByRole("button", { name: "50 题", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(await records(page)).toEqual([]);
  const nextSession = await startSession(page, 50);
  expect(nextSession).not.toBe(sessionUrl);
});

test("无记录时错项强化留在设置，有记录后创建独立强化会话并记录正确标题", async ({ page, baseURL }) => {
  await page.goto("/zh-CN/");
  await page.getByRole("button", { name: "错项强化", exact: true }).click();
  await expect(page.locator('.error[role="alert"]')).toContainText("所选范围还没有练习记录");
  await expect(page).toHaveURL(new URL("/zh-CN/", baseURL).href);
  const ordinaryUrl = await startSession(page);
  await page.keyboard.press("q");
  await completeSession(page);
  await expect.poll(async () => (await records(page)).length).toBe(1);
  await page.getByRole("button", { name: "返回练习设置", exact: true }).click();
  await expect(startButton(page)).toBeFocused();
  await page.getByRole("button", { name: "错项强化", exact: true }).click();
  await expect(page).toHaveURL(/\/practice\/\?session=[0-9a-f-]+$/);
  const weakUrl = page.url();
  expect(weakUrl).not.toBe(ordinaryUrl);
  await completeSession(page);
  await expect(page).toHaveURL(weakUrl);
  await expect.poll(async () => (await records(page)).length).toBe(2);
  expect((await records(page)).map((record) => record.title).sort()).toEqual(["五十音 · 自由练习", "五十音 · 错项强化"].sort());
});

test("练习记录空状态的两个入口均回到原首页设置", async ({ page, baseURL }) => {
  for (const name of ["继续练习", "去练习五十音"]) {
    await page.goto("/zh-CN/history/");
    await expect(page.getByRole("heading", { name: "你的进步，将从这里开始", exact: true })).toBeVisible();
    const link = page.getByRole("link", { name, exact: true });
    await expect(link).toHaveAttribute("href", "/zh-CN/");
    await link.click();
    await expect(page).toHaveURL(new URL("/zh-CN/", baseURL).href);
    await expect(startButton(page)).toBeEnabled();
  }
});


test("取消尚未完成的练习导航后仍可再次开始，不被开始状态锁住", async ({ page, baseURL }) => {
  let delayedRoute: Route | undefined;
  await page.route("**/practice/**", async (route) => {
    if (!delayedRoute && route.request().resourceType() === "fetch") {
      delayedRoute = route;
      return;
    }
    await route.continue();
  });
  await page.goto("/zh-CN/");
  await startButton(page).click();
  await expect.poll(() => Boolean(delayedRoute)).toBe(true);
  await expect(startButton(page)).toBeDisabled();
  await expect(page.getByRole("button", { name: "错项强化", exact: true })).toBeDisabled();
  await page.getByRole("navigation", { name: "主导航" }).getByRole("link", { name: "五十音练习", exact: true }).click();
  await delayedRoute!.continue().catch(() => {});
  await delayedRoute!.request().response().catch(() => null);
  await expect(page).toHaveURL(new URL("/zh-CN/", baseURL).href);
  await expect(startButton(page)).toBeEnabled();
  await startSession(page);
});
