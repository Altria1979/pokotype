import { expect, test, type Page, type Route } from "@playwright/test";
import { SAMPLE_ARTICLES } from "../src/lib/articles";

const providers = {
  deepseek: {
    label: "DeepSeek API 密钥",
    modelsUrl: "https://api.deepseek.com/models",
    generationUrl: "https://api.deepseek.com/chat/completions",
    storage: "pokotype:api-key:v1",
    key: "test-only-connection-deepseek-key",
  },
  bailian: {
    label: "阿里百炼 API 密钥",
    modelsUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1/models",
    generationUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    storage: "pokotype:api-key:bailian:v1",
    key: "test-only-connection-bailian-key",
  },
} as const;

const providerApi = /^https:\/\/(?:api\.deepseek\.com|dashscope\.aliyuncs\.com)\//;
const discoveredModel = "deepseek-official-discovered-model";

function keyCard(page: Page, provider: keyof typeof providers = "deepseek") {
  return page.getByRole("region", { name: providers[provider].label, exact: true });
}

async function readKey(page: Page, name: keyof typeof providers = "deepseek") {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  }, providers[name].storage);
}

async function respondWithModels(route: Route, ids: string[]) {
  await route.fulfill({ json: { object: "list", data: ids.map((id) => ({ id })) } });
}

for (const name of ["deepseek", "bailian"] as const) {
  test(`${name} 草稿检查只发带对应密钥的 GET，保存同一密钥保留验证且刷新清除验证`, async ({ page }) => {
    const provider = providers[name];
    const requests: { url: string; method: string; authorization: string; body: string | null }[] = [];
    await page.route(providerApi, async (route) => {
      requests.push({
        url: route.request().url(),
        method: route.request().method(),
        authorization: route.request().headers().authorization,
        body: route.request().postData(),
      });
      await respondWithModels(route, [name === "deepseek" ? "deepseek-flash" : "qwen3.8-flash"]);
    });
    await page.goto("/zh-CN/settings/");
    const card = keyCard(page, name);
    await expect(keyCard(page, "deepseek")).toBeVisible();
    await expect(keyCard(page, "bailian")).toBeVisible();
    await expect(card.getByRole("button", { name: "检查连接", exact: true })).toBeDisabled();
    await card.getByLabel(provider.label, { exact: true }).fill(provider.key);
    await card.getByRole("button", { name: "检查连接", exact: true }).click();
    await expect(card.getByText("密钥验证通过，已读取 1 个模型。", { exact: false })).toBeVisible();
    await expect(card.getByRole("status")).toContainText("尚未保存");
    expect(await readKey(page, name)).toBeNull();
    await expect(card.getByRole("button", { name: "保存密钥", exact: true })).toBeVisible();
    await expect(card.getByRole("button", { name: "清除密钥", exact: true })).toBeDisabled();
    expect(requests).toEqual([{
      url: provider.modelsUrl,
      method: "GET",
      authorization: `Bearer ${provider.key}`,
      body: null,
    }]);

    await card.getByRole("button", { name: "保存密钥", exact: true }).click();
    await expect(card.getByRole("button", { name: "替换密钥", exact: true })).toBeVisible();
    await expect(card.getByText("检查通过", { exact: true })).toBeVisible();
    await expect(card.getByRole("status")).toContainText("密钥验证通过，已读取 1 个模型。");
    await expect(card.getByRole("status")).not.toContainText("尚未保存");
    await expect(card.getByRole("status")).not.toContainText("尚未检查");
    await expect(card.getByRole("button", { name: "查看模型列表", exact: true })).toBeVisible();
    expect(await readKey(page, name)).toEqual({ version: 1, value: provider.key });
    expect(requests).toHaveLength(1);
    await page.reload();
    await expect(card.getByText(/密钥验证通过/)).toHaveCount(0);
    await expect(card.getByRole("button", { name: "查看模型列表", exact: true })).toHaveCount(0);
    await expect(card.getByRole("button", { name: "替换密钥", exact: true })).toBeVisible();
    expect(requests).toHaveLength(1);
  });
}

test("已保存 DeepSeek 密钥读出的新模型可选并生成，清除密钥后目录失效", async ({ page }) => {
  const requests: { url: string; method: string; authorization: string; model?: string }[] = [];
  await page.route(providerApi, async (route) => {
    const request = route.request();
    requests.push({
      url: request.url(),
      method: request.method(),
      authorization: request.headers().authorization,
      ...(request.method() === "POST" ? { model: request.postDataJSON().model } : {}),
    });
    if (request.url() === providers.deepseek.modelsUrl) {
      await respondWithModels(route, ["deepseek-flash", discoveredModel]);
      return;
    }
    await route.fulfill({
      json: {
        choices: [{
          finish_reason: "stop",
          message: { content: JSON.stringify({ title: "官方目录模型生成的文章", sentences: SAMPLE_ARTICLES[0].sentences }) },
        }],
      },
    });
  });
  await page.goto("/zh-CN/settings/");
  const card = keyCard(page);
  await card.getByLabel(providers.deepseek.label, { exact: true }).fill(providers.deepseek.key);
  await card.getByRole("button", { name: "保存密钥", exact: true }).click();
  await expect(card.getByRole("button", { name: "替换密钥", exact: true })).toBeVisible();
  expect(requests).toHaveLength(0);
  await card.getByRole("button", { name: "检查连接", exact: true }).click();
  await expect(card.getByText("密钥验证通过，已读取 2 个模型。", { exact: false })).toBeVisible();
  const model = page.getByLabel("生成模型", { exact: true });
  await expect(model.locator(`option[value="${discoveredModel}"]`)).toHaveCount(1);
  await model.selectOption(discoveredModel);
  await expect(page.getByLabel("自定义模型 ID", { exact: true })).toHaveCount(0);

  await page.getByRole("link", { name: "我的文章库", exact: true }).click();
  await page.getByRole("button", { name: "生成新文章", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "AI 生成文章", exact: true });
  await expect(dialog.getByLabel("生成模型", { exact: true })).toHaveValue(discoveredModel);
  await expect(dialog.getByLabel("自定义模型 ID", { exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "生成练习文章", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("已保存到我的文章库");
  expect(requests).toEqual([
    { url: providers.deepseek.modelsUrl, method: "GET", authorization: `Bearer ${providers.deepseek.key}` },
    { url: providers.deepseek.generationUrl, method: "POST", authorization: `Bearer ${providers.deepseek.key}`, model: discoveredModel },
  ]);
  await dialog.getByRole("button", { name: "留在当前页", exact: true }).click();
  await page.getByRole("link", { name: "设置", exact: true }).click();
  await expect(model.locator(`option[value="${discoveredModel}"]`)).toHaveCount(1);
  await card.getByRole("button", { name: "清除密钥", exact: true }).click();
  await expect(model.locator(`option[value="${discoveredModel}"]`)).toHaveCount(0);
  expect(await readKey(page)).toBeNull();
  await page.reload();
  await expect(model.locator(`option[value="${discoveredModel}"]`)).toHaveCount(0);
  await expect(card.getByText(/密钥验证通过/)).toHaveCount(0);
});

test("连接检查 HTTP 401 不回显原始错误或密钥，不误报成功且不自动重试", async ({ page }) => {
  let calls = 0;
  await page.route(providerApi, async (route) => {
    calls++;
    await route.fulfill({
      status: 401,
      json: { error: { message: `private-auth-failure ${providers.deepseek.key}` } },
    });
  });
  await page.goto("/zh-CN/settings/");
  const card = keyCard(page);
  await card.getByLabel(providers.deepseek.label, { exact: true }).fill(providers.deepseek.key);
  await card.getByRole("button", { name: "检查连接", exact: true }).click();
  await expect(card.getByRole("alert")).toContainText("密钥");
  await expect(card).not.toContainText("private-auth-failure");
  await expect(card).not.toContainText(providers.deepseek.key);
  await expect(card.getByText(/密钥验证通过/)).toHaveCount(0);
  await expect(card.getByRole("button", { name: "检查连接", exact: true })).toBeEnabled();
  expect(await readKey(page)).toBeNull();
  expect(calls).toBe(1);
});

for (const action of ["取消检查", "编辑密钥"] as const) {
  test(`${action} 后忽略迟到的模型列表，不显示验证成功或插入模型`, async ({ page }) => {
    let pendingRoute: Route | undefined;
    let calls = 0;
    await page.route(providerApi, (route) => {
      calls++;
      pendingRoute = route;
    });
    await page.goto("/zh-CN/settings/");
    const card = keyCard(page);
    const input = card.getByLabel(providers.deepseek.label, { exact: true });
    await input.fill(providers.deepseek.key);
    await card.getByRole("button", { name: "保存密钥", exact: true }).click();
    await expect(card.getByRole("button", { name: "替换密钥", exact: true })).toBeVisible();
    await card.getByRole("button", { name: "检查连接", exact: true }).click();
    await expect.poll(() => calls).toBe(1);
    await expect(card.getByRole("button", { name: "正在检查…", exact: true })).toBeDisabled();
    const aborted = page.waitForEvent("requestfailed", { predicate: (request) => request.url() === providers.deepseek.modelsUrl });
    if (action === "取消检查") await card.getByRole("button", { name: "取消检查", exact: true }).click();
    else await input.fill("test-only-replacement-draft-key");
    await aborted;
    await pendingRoute?.fulfill({
      json: { object: "list", data: [{ id: discoveredModel }] },
    }).catch(() => {});
    await expect(card.getByRole("button", { name: "检查连接", exact: true })).toBeEnabled();
    await expect(card.getByText(/密钥验证通过/)).toHaveCount(0);
    await expect(page.getByLabel("生成模型", { exact: true }).locator(`option[value="${discoveredModel}"]`)).toHaveCount(0);
    expect(await readKey(page)).toEqual({ version: 1, value: providers.deepseek.key });
    expect(calls).toBe(1);
  });
}

test("390px 设置页可发现两家密钥入口且不会横向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/zh-CN/settings/");
  for (const name of ["deepseek", "bailian"] as const) {
    const card = keyCard(page, name);
    await card.scrollIntoViewIfNeeded();
    await expect(card).toBeVisible();
    await expect(card.getByLabel(providers[name].label, { exact: true })).toBeVisible();
    await expect(card.getByRole("button", { name: "检查连接", exact: true })).toBeVisible();
    const box = (await card.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  }
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
