import { expect, test, type Page, type Route } from "@playwright/test";
import { SAMPLE_ARTICLES } from "../src/lib/articles";

const providerApi = /^https:\/\/(?:api\.deepseek\.com|dashscope\.aliyuncs\.com)\//;
const modelsUrl = "https://dashscope.aliyuncs.com/compatible-mode/v1/models";
const generationUrl = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
const keyStorage = "pokotype:api-key:bailian:v1";
const fakeKey = "test-only-bailian-full-catalog-key";
const models = [
  "qwen3.8-flash",
  "qwen3.7-flash",
  ...Array.from({ length: 224 }, (_, index) => `qwen-catalog-model-${String(index + 1).padStart(3, "0")}`),
];
const discoveredModel = models.at(-1)!;

function keyCard(page: Page) {
  return page.getByRole("region", { name: "阿里百炼 API 密钥", exact: true });
}

async function respondWithModels(route: Route) {
  await route.fulfill({ json: { object: "list", data: models.map((id) => ({ id })) } });
}

test("百炼草稿的 226 个模型在保存后同步到设置和文章库生成弹窗，无需再次检查", async ({ page }, testInfo) => {
  const requests: { url: string; method: string; authorization: string; model?: string }[] = [];
  await page.route(providerApi, async (route) => {
    const request = route.request();
    requests.push({
      url: request.url(),
      method: request.method(),
      authorization: request.headers().authorization,
      ...(request.method() === "POST" ? { model: request.postDataJSON().model } : {}),
    });
    if (request.method() === "GET") {
      await respondWithModels(route);
      return;
    }
    await route.fulfill({
      json: {
        choices: [{
          finish_reason: "stop",
          message: { content: JSON.stringify({ title: "百炼完整目录模型生成的文章", sentences: SAMPLE_ARTICLES[0].sentences }) },
        }],
      },
    });
  });
  await page.goto("/zh-CN/settings/");
  await page.getByLabel("AI 服务", { exact: true }).selectOption("bailian");
  const model = page.getByLabel("生成模型", { exact: true });
  const card = keyCard(page);
  await card.getByLabel("阿里百炼 API 密钥", { exact: true }).fill(fakeKey);
  await card.getByRole("button", { name: "检查连接", exact: true }).click();
  await expect(card.getByRole("status")).toContainText("已读取 226 个模型");
  await expect(card.getByRole("status")).toContainText("尚未保存");
  await expect(model.locator("option")).toHaveCount(3);
  expect(await page.evaluate((key) => localStorage.getItem(key), keyStorage)).toBeNull();

  await card.getByRole("button", { name: "查看模型列表", exact: true }).click();
  const listDialog = page.getByRole("dialog", { name: "阿里百炼 模型列表", exact: true });
  await expect(listDialog).toContainText("226 个模型");
  await expect(listDialog.getByRole("region", { name: "模型列表", exact: true }).locator("code")).toHaveText(models);
  await listDialog.getByRole("button", { name: "关闭模型列表", exact: true }).click();
  await card.getByRole("button", { name: "保存密钥", exact: true }).click();
  await expect(card.getByText("检查通过", { exact: true })).toBeVisible();
  await expect(card.getByRole("status")).not.toContainText("尚未保存");
  await expect(card.getByRole("button", { name: "查看模型列表", exact: true })).toBeVisible();
  await expect(model.locator("option")).toHaveCount(models.length + 1);
  expect(await model.locator("option").evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value))).toEqual([...models, "__custom__"]);
  await expect(page.getByText(/已同步 226 个模型/)).toBeVisible();
  await expect(page.getByText(/请选择支持文本对话的模型/)).toBeVisible();
  expect(requests).toEqual([{ url: modelsUrl, method: "GET", authorization: `Bearer ${fakeKey}` }]);

  await page.getByRole("link", { name: "我的文章库", exact: true }).click();
  await page.getByRole("button", { name: "生成新文章", exact: true }).click();
  const generator = page.getByRole("dialog", { name: "AI 生成文章", exact: true });
  const generationModel = generator.getByLabel("生成模型", { exact: true });
  await expect(generator.getByLabel("AI 服务", { exact: true })).toHaveValue("bailian");
  await expect(generationModel.locator("option")).toHaveCount(models.length + 1);
  await expect(generator.getByText(/已同步 226 个模型/)).toBeVisible();
  expect(await generationModel.locator("option").evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value))).toEqual([...models, "__custom__"]);
  await generationModel.selectOption(discoveredModel);
  await expect(generator.getByLabel("自定义模型 ID", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("bailian-226-synced.png") });
  await generator.getByRole("button", { name: "生成练习文章", exact: true }).click();
  await expect(generator.getByRole("status")).toContainText("已保存到我的文章库");
  expect(requests).toEqual([
    { url: modelsUrl, method: "GET", authorization: `Bearer ${fakeKey}` },
    { url: generationUrl, method: "POST", authorization: `Bearer ${fakeKey}`, model: discoveredModel },
  ]);
  await generator.getByRole("button", { name: "留在当前页", exact: true }).click();
  await page.getByRole("link", { name: "设置", exact: true }).click();
  await expect(model.locator("option")).toHaveCount(models.length + 1);
  await expect(model).toHaveValue(discoveredModel);
  await page.reload();
  await expect(model.locator("option")).toHaveCount(3);
  await expect(model.locator(`option[value="${discoveredModel}"]`)).toHaveCount(0);
  await expect(card.getByRole("button", { name: "查看模型列表", exact: true })).toHaveCount(0);
  await expect(card.getByRole("button", { name: "替换密钥", exact: true })).toBeVisible();
  expect(requests).toHaveLength(2);
});

for (const action of ["替换密钥", "清除密钥", "检查失败"] as const) {
  test(`百炼${action}后完整模型目录失效，回到默认选项`, async ({ page }) => {
    let calls = 0;
    await page.route(providerApi, async (route) => {
      calls++;
      expect(route.request().url()).toBe(modelsUrl);
      expect(route.request().method()).toBe("GET");
      if (calls === 1) await respondWithModels(route);
      else await route.fulfill({ status: 401, json: { error: { message: `private-catalog-error ${fakeKey}` } } });
    });
    await page.goto("/zh-CN/settings/");
    await page.getByLabel("AI 服务", { exact: true }).selectOption("bailian");
    const card = keyCard(page);
    const input = card.getByLabel("阿里百炼 API 密钥", { exact: true });
    const model = page.getByLabel("生成模型", { exact: true });
    await input.fill(fakeKey);
    await card.getByRole("button", { name: "保存密钥", exact: true }).click();
    await expect(card.getByRole("button", { name: "替换密钥", exact: true })).toBeVisible();
    expect(calls).toBe(0);
    await card.getByRole("button", { name: "检查连接", exact: true }).click();
    await expect(model.locator("option")).toHaveCount(models.length + 1);
    await expect(card.getByRole("button", { name: "查看模型列表", exact: true })).toBeVisible();

    if (action === "替换密钥") {
      const replacement = "test-only-bailian-replacement-catalog-key";
      await input.fill(replacement);
      await expect(model.locator("option")).toHaveCount(3);
      await card.getByRole("button", { name: "替换密钥", exact: true }).click();
      await expect(card.getByRole("status")).toContainText("尚未检查连接");
      expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), keyStorage)).toEqual({ version: 1, value: replacement });
    } else if (action === "清除密钥") {
      await card.getByRole("button", { name: "清除密钥", exact: true }).click();
      expect(await page.evaluate((key) => localStorage.getItem(key), keyStorage)).toBeNull();
    } else {
      await card.getByRole("button", { name: "检查连接", exact: true }).click();
      await expect(card.getByRole("alert")).toBeVisible();
      await expect(card).not.toContainText("private-catalog-error");
      await expect(card).not.toContainText(fakeKey);
    }
    await expect(model.locator("option")).toHaveCount(3);
    await expect(model.locator(`option[value="${discoveredModel}"]`)).toHaveCount(0);
    await expect(card.getByRole("button", { name: "查看模型列表", exact: true })).toHaveCount(0);
    await expect(card.getByText("检查通过", { exact: true })).toHaveCount(0);
    expect(calls).toBe(action === "检查失败" ? 2 : 1);
  });
}
