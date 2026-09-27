import { expect, test, type Page, type Route } from "@playwright/test";
import { SAMPLE_ARTICLES } from "../src/lib/articles";

type Provider = "deepseek" | "bailian";

const endpoints = {
  deepseek: "https://api.deepseek.com/chat/completions",
  bailian: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
};
const keyStorage = {
  deepseek: "pokotype:api-key:v1",
  bailian: "pokotype:api-key:bailian:v1",
};
const settingsStorage = "pokotype:ai-settings:v1";
const fakeKeys = {
  deepseek: "test-only-deepseek-selection-key",
  bailian: "test-only-bailian-selection-key",
};
const defaultModels = { deepseek: "deepseek-flash", bailian: "qwen3.8-flash" };

async function seedSettings(
  page: Page,
  providers: Provider[],
  provider?: Provider,
) {
  await page.goto("/zh-CN/settings/");
  await page.evaluate(({ providers, provider, keyStorage, fakeKeys, settingsStorage, defaultModels }) => {
    for (const name of providers) {
      localStorage.setItem(keyStorage[name], JSON.stringify({ version: 1, value: fakeKeys[name] }));
    }
    if (provider) {
      localStorage.setItem(settingsStorage, JSON.stringify({
        version: 1,
        value: { provider, models: defaultModels },
      }));
    }
  }, { providers, provider, keyStorage, fakeKeys, settingsStorage, defaultModels });
}

async function storedValue(page: Page, key: string) {
  return page.evaluate((key) => {
    const value = localStorage.getItem(key);
    return value === null ? null : JSON.parse(value);
  }, key);
}

async function respondWithArticle(route: Route, title: string) {
  await route.fulfill({
    json: {
      choices: [{
        finish_reason: "stop",
        message: { content: JSON.stringify({ title, sentences: SAMPLE_ARTICLES[0].sentences }) },
      }],
    },
  });
}

async function openGenerator(page: Page) {
  await page.goto("/zh-CN/articles/");
  await page.getByRole("button", { name: "生成新文章", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "AI 生成文章", exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("两家密钥入口始终可见，草稿、保存、替换和清除各自独立", async ({ page }) => {
  await page.goto("/zh-CN/settings/");
  const provider = page.getByLabel("AI 服务", { exact: true });
  const deepseek = page.getByRole("region", { name: "DeepSeek API 密钥", exact: true });
  const bailian = page.getByRole("region", { name: "阿里百炼 API 密钥", exact: true });
  const deepseekKey = deepseek.getByLabel("DeepSeek API 密钥", { exact: true });
  const bailianKey = bailian.getByLabel("阿里百炼 API 密钥", { exact: true });
  const clearDeepseek = deepseek.getByRole("button", { name: "清除密钥", exact: true });
  const clearBailian = bailian.getByRole("button", { name: "清除密钥", exact: true });
  await expect(provider).toHaveCount(1);
  await expect(provider).toHaveValue("deepseek");
  await expect(page.getByLabel("生成模型", { exact: true })).toHaveValue("deepseek-flash");
  await expect(deepseek).toBeVisible();
  await expect(bailian).toBeVisible();
  await expect(deepseekKey).toHaveAttribute("type", "password");
  await expect(bailianKey).toHaveAttribute("type", "password");
  await expect(clearDeepseek).toBeDisabled();
  await expect(clearBailian).toBeDisabled();

  await deepseekKey.fill(fakeKeys.deepseek);
  await bailianKey.fill(fakeKeys.bailian);
  await provider.selectOption("bailian");
  await expect(deepseekKey).toHaveValue(fakeKeys.deepseek);
  await expect(bailianKey).toHaveValue(fakeKeys.bailian);
  await deepseek.getByRole("button", { name: "保存密钥", exact: true }).click();
  await expect(deepseek.getByRole("button", { name: "替换密钥", exact: true })).toBeVisible();
  await expect(deepseekKey).toHaveValue("");
  await expect(bailianKey).toHaveValue(fakeKeys.bailian);
  await bailian.getByRole("button", { name: "保存密钥", exact: true }).click();
  await expect(bailianKey).toHaveValue("");
  await provider.selectOption("deepseek");
  await expect(deepseek).toBeVisible();
  await expect(bailian).toBeVisible();
  await expect(clearDeepseek).toBeEnabled();
  await expect(clearBailian).toBeEnabled();

  const replacement = "test-only-replacement-deepseek-key";
  await deepseekKey.fill(replacement);
  await deepseek.getByRole("button", { name: "替换密钥", exact: true }).click();
  expect(await storedValue(page, keyStorage.deepseek)).toEqual({ version: 1, value: replacement });
  expect(await storedValue(page, keyStorage.bailian)).toEqual({ version: 1, value: fakeKeys.bailian });
  await clearDeepseek.click();
  expect(await storedValue(page, keyStorage.deepseek)).toBeNull();
  expect(await storedValue(page, keyStorage.bailian)).toEqual({ version: 1, value: fakeKeys.bailian });
  await expect(clearBailian).toBeEnabled();
  await expect(bailianKey).toHaveValue("");
  await page.reload();
  await expect(clearDeepseek).toBeDisabled();
  await expect(clearBailian).toBeEnabled();
  await clearBailian.click();
  expect(await storedValue(page, keyStorage.bailian)).toBeNull();
  expect(await storedValue(page, keyStorage.deepseek)).toBeNull();
});

test("设置与生成弹窗共享模型选择，两家模型分别记忆并在刷新后保留", async ({ page }) => {
  await page.goto("/zh-CN/settings/");
  const provider = page.getByLabel("AI 服务", { exact: true });
  const model = page.getByLabel("生成模型", { exact: true });
  await model.selectOption("deepseek-v4-flash");
  await provider.selectOption("bailian");
  await model.selectOption("qwen3.7-flash");
  await page.reload();
  await expect(provider).toHaveValue("bailian");
  await expect(model).toHaveValue("qwen3.7-flash");
  expect(await storedValue(page, settingsStorage)).toEqual({
    version: 1,
    value: { provider: "bailian", models: { deepseek: "deepseek-v4-flash", bailian: "qwen3.7-flash" } },
  });

  const dialog = await openGenerator(page);
  await expect(dialog.getByLabel("AI 服务", { exact: true })).toHaveCount(1);
  await expect(dialog.getByLabel("AI 服务", { exact: true })).toHaveValue("bailian");
  await expect(dialog.getByLabel("生成模型", { exact: true })).toHaveValue("qwen3.7-flash");
  await dialog.getByLabel("AI 服务", { exact: true }).selectOption("deepseek");
  await expect(dialog.getByLabel("生成模型", { exact: true })).toHaveValue("deepseek-v4-flash");
  await dialog.getByLabel("生成模型", { exact: true }).selectOption("__custom__");
  await dialog.getByLabel("自定义模型 ID", { exact: true }).fill("deepseek-custom-preview");
  await dialog.getByRole("button", { name: "关闭生成窗口", exact: true }).click();
  await page.goto("/zh-CN/settings/");
  await expect(provider).toHaveValue("deepseek");
  await expect(model).toHaveValue("__custom__");
  await expect(page.getByLabel("自定义模型 ID", { exact: true })).toHaveValue("deepseek-custom-preview");
  await provider.selectOption("bailian");
  await expect(model).toHaveValue("qwen3.7-flash");
  await page.reload();
  expect(await storedValue(page, settingsStorage)).toEqual({
    version: 1,
    value: { provider: "bailian", models: { deepseek: "deepseek-custom-preview", bailian: "qwen3.7-flash" } },
  });
});

test("逐字输入包含预设名称的自定义模型时，输入框始终保留焦点和完整内容", async ({ page }) => {
  const cases = [
    { provider: "deepseek", model: "deepseek-flash-custom" },
    { provider: "bailian", model: "qwen3.8-flash-custom" },
  ] as const;
  await page.goto("/zh-CN/settings/");
  for (const { provider, model } of cases) {
    await page.getByLabel("AI 服务", { exact: true }).selectOption(provider);
    await page.getByLabel("生成模型", { exact: true }).selectOption("__custom__");
    const input = page.getByLabel("自定义模型 ID", { exact: true });
    await input.fill("");
    await input.focus();
    for (const character of model) {
      await input.pressSequentially(character);
      await expect(input).toBeFocused();
      await expect(page.getByLabel("生成模型", { exact: true })).toHaveValue("__custom__");
    }
    await expect(input).toHaveValue(model);
  }

  const dialog = await openGenerator(page);
  for (const { provider, model } of cases) {
    await dialog.getByLabel("AI 服务", { exact: true }).selectOption(provider);
    await dialog.getByLabel("生成模型", { exact: true }).selectOption("__custom__");
    const input = dialog.getByLabel("自定义模型 ID", { exact: true });
    await input.fill("");
    await input.focus();
    for (const character of model) {
      await input.pressSequentially(character);
      await expect(input).toBeFocused();
      await expect(dialog.getByLabel("生成模型", { exact: true })).toHaveValue("__custom__");
    }
    await expect(input).toHaveValue(model);
  }
});

test("设置页页尾弹窗的模型变更立即同步到设置，随后切换不会用旧值覆盖", async ({ page }) => {
  await page.goto("/zh-CN/settings/");
  const provider = page.getByLabel("AI 服务", { exact: true });
  const model = page.getByLabel("生成模型", { exact: true });
  await model.selectOption("deepseek-v4-flash");
  await page.getByRole("contentinfo").getByRole("button", { name: "用 AI 写一篇", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "AI 生成文章", exact: true });
  await dialog.getByLabel("AI 服务", { exact: true }).selectOption("bailian");
  await dialog.getByLabel("生成模型", { exact: true }).selectOption("qwen3.7-flash");
  await dialog.getByRole("button", { name: "关闭生成窗口", exact: true }).click();
  await expect(provider).toHaveValue("bailian");
  await expect(model).toHaveValue("qwen3.7-flash");
  await provider.selectOption("deepseek");
  await expect(model).toHaveValue("deepseek-v4-flash");
  await provider.selectOption("bailian");
  await expect(model).toHaveValue("qwen3.7-flash");
  expect(await storedValue(page, settingsStorage)).toEqual({
    version: 1,
    value: { provider: "bailian", models: { deepseek: "deepseek-v4-flash", bailian: "qwen3.7-flash" } },
  });
});

test("仅有旧版 DeepSeek 密钥时默认选择仍可直接生成", async ({ page }) => {
  await seedSettings(page, ["deepseek"]);
  expect(await storedValue(page, settingsStorage)).toBeNull();
  let calls = 0;
  await page.route("https://api.deepseek.com/**", async (route) => {
    calls++;
    expect(route.request().url()).toBe(endpoints.deepseek);
    expect(route.request().headers().authorization).toBe(`Bearer ${fakeKeys.deepseek}`);
    expect(route.request().postDataJSON().model).toBe("deepseek-flash");
    await respondWithArticle(route, "旧版密钥生成的文章");
  });
  const dialog = await openGenerator(page);
  await expect(dialog.getByLabel("AI 服务", { exact: true })).toHaveValue("deepseek");
  await expect(dialog.getByLabel("生成模型", { exact: true })).toHaveValue("deepseek-flash");
  await dialog.getByRole("button", { name: "生成练习文章", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("已保存到我的文章库");
  expect(calls).toBe(1);
});

for (const provider of ["deepseek", "bailian"] as const) {
  test(`当前 ${provider} 无密钥时禁用生成，不借用另一家的密钥`, async ({ page }) => {
    const other = provider === "deepseek" ? "bailian" : "deepseek";
    await seedSettings(page, [other], provider);
    const dialog = await openGenerator(page);
    const submit = dialog.getByRole("button", { name: "生成练习文章", exact: true });
    const selector = dialog.getByLabel("AI 服务", { exact: true });
    await expect(selector).toHaveValue(provider);
    await expect(submit).toBeDisabled();
    await expect(dialog.getByRole("link", { name: /前往设置/ })).toHaveAttribute("href", "/zh-CN/settings/");
    await selector.selectOption(other);
    await expect(submit).toBeEnabled();
    await selector.selectOption(provider);
    await expect(submit).toBeDisabled();
  });
}

test("全部预设和两家自定义模型使用对应 endpoint、密钥及非思考 JSON 参数", async ({ page }) => {
  await seedSettings(page, ["deepseek", "bailian"]);
  const requests: { url: string; authorization: string; body: Record<string, unknown> }[] = [];
  const respond = async (route: Route) => {
    requests.push({
      url: route.request().url(),
      authorization: route.request().headers().authorization,
      body: route.request().postDataJSON(),
    });
    await respondWithArticle(route, `模型选择生成文章 ${requests.length}`);
  };
  await page.route("https://api.deepseek.com/**", respond);
  await page.route("https://dashscope.aliyuncs.com/**", respond);
  const dialog = await openGenerator(page);
  const choices = [
    { provider: "deepseek", model: "deepseek-flash" },
    { provider: "deepseek", model: "deepseek-v4-flash" },
    { provider: "deepseek", model: "deepseek-custom-preview", custom: true },
    { provider: "bailian", model: "qwen3.8-flash" },
    { provider: "bailian", model: "qwen3.7-flash" },
    { provider: "bailian", model: "qwen-custom-preview", custom: true },
  ] as const;
  for (const [index, choice] of choices.entries()) {
    if (index > 0) await page.getByRole("button", { name: "生成新文章", exact: true }).click();
    await dialog.getByLabel("AI 服务", { exact: true }).selectOption(choice.provider);
    await dialog.getByLabel("生成模型", { exact: true }).selectOption("custom" in choice ? "__custom__" : choice.model);
    if ("custom" in choice) {
      await dialog.getByLabel("自定义模型 ID", { exact: true }).fill(choice.model);
    }
    await dialog.getByRole("button", { name: "生成练习文章", exact: true }).click();
    await expect(dialog.getByRole("heading", { name: `模型选择生成文章 ${index + 1}`, exact: true })).toBeVisible();
    await expect(dialog.getByRole("status")).toContainText("已保存到我的文章库");
    expect(requests).toHaveLength(index + 1);
    const request = requests[index];
    expect(request.url).toBe(endpoints[choice.provider]);
    expect(request.authorization).toBe(`Bearer ${fakeKeys[choice.provider]}`);
    expect(request.body).toMatchObject({
      model: choice.model,
      stream: false,
      response_format: { type: "json_object" },
    });
    if (choice.provider === "bailian") {
      expect(request.body.enable_thinking).toBe(false);
      expect(request.body).not.toHaveProperty("thinking");
    } else {
      expect(request.body.thinking).toEqual({ type: "disabled" });
      expect(request.body).not.toHaveProperty("enable_thinking");
    }
    expect(JSON.stringify(request.body.messages)).toContain("JSON");
    expect(JSON.stringify(request.body)).not.toContain(fakeKeys.deepseek);
    expect(JSON.stringify(request.body)).not.toContain(fakeKeys.bailian);
    await dialog.getByRole("button", { name: "留在当前页", exact: true }).click();
  }
});

for (const status of [401, 404] as const) {
  test(`百炼 HTTP ${status} 显示安全错误，不自动重试或回退其他模型与服务`, async ({ page }) => {
    await seedSettings(page, ["deepseek", "bailian"], "bailian");
    const calls: string[] = [];
    const reject = async (route: Route) => {
      calls.push(route.request().url());
      await route.fulfill({
        status,
        json: { error: { message: `private-upstream-body ${fakeKeys.bailian}`, code: "raw-provider-code" } },
      });
    };
    await page.route("https://api.deepseek.com/**", reject);
    await page.route("https://dashscope.aliyuncs.com/**", reject);
    const dialog = await openGenerator(page);
    await dialog.getByLabel("生成模型", { exact: true }).selectOption("qwen3.7-flash");
    await dialog.getByRole("button", { name: "生成练习文章", exact: true }).click();
    const alert = dialog.getByRole("alert");
    await expect(alert).toContainText("阿里百炼");
    await expect(alert).toContainText(status === 401 ? "密钥" : "模型");
    await expect(alert).not.toContainText("private-upstream-body");
    await expect(alert).not.toContainText("raw-provider-code");
    await expect(alert).not.toContainText(fakeKeys.bailian);
    await expect(dialog.getByLabel("AI 服务", { exact: true })).toHaveValue("bailian");
    await expect(dialog.getByLabel("生成模型", { exact: true })).toHaveValue("qwen3.7-flash");
    await expect(dialog.getByRole("button", { name: "生成练习文章", exact: true })).toBeEnabled();
    expect(calls).toEqual([endpoints.bailian]);
    await dialog.getByRole("button", { name: "关闭生成窗口", exact: true }).click();
    await expect(page.getByRole("heading", { name: SAMPLE_ARTICLES[0].title, exact: true })).toBeVisible();
    expect(calls).toHaveLength(1);
  });
}

test("百炼生成中锁定服务、模型和自定义输入，取消后原文章库仍然可用", async ({ page }) => {
  await seedSettings(page, ["deepseek", "bailian"], "bailian");
  let calls = 0;
  let pendingRoute: Route | undefined;
  await page.route("https://dashscope.aliyuncs.com/**", async (route) => {
    calls++;
    if (calls === 1) await respondWithArticle(route, "取消前保留的百炼文章");
    else pendingRoute = route;
  });
  const dialog = await openGenerator(page);
  await dialog.getByRole("button", { name: "生成练习文章", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("已保存到我的文章库");
  await dialog.getByRole("button", { name: "留在当前页", exact: true }).click();
  await page.getByRole("button", { name: "生成新文章", exact: true }).click();
  await dialog.getByLabel("生成模型", { exact: true }).selectOption("__custom__");
  await dialog.getByLabel("自定义模型 ID", { exact: true }).fill("qwen-pending-preview");
  await dialog.getByRole("button", { name: "生成练习文章", exact: true }).click();
  await expect.poll(() => calls).toBe(2);
  await expect(dialog.getByLabel("AI 服务", { exact: true })).toBeDisabled();
  await expect(dialog.getByLabel("生成模型", { exact: true })).toBeDisabled();
  await expect(dialog.getByLabel("自定义模型 ID", { exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "正在创作你的文章…", exact: true })).toBeDisabled();
  const aborted = page.waitForEvent("requestfailed", { predicate: (request) => request.url() === endpoints.bailian });
  await dialog.getByRole("button", { name: "取消生成", exact: true }).click();
  await aborted;
  await expect(dialog.getByRole("alert")).toContainText("已取消生成");
  await expect(dialog.getByLabel("AI 服务", { exact: true })).toBeEnabled();
  await expect(dialog.getByLabel("生成模型", { exact: true })).toBeEnabled();
  await expect(dialog.getByLabel("自定义模型 ID", { exact: true })).toHaveValue("qwen-pending-preview");
  await expect(dialog.getByRole("button", { name: "生成练习文章", exact: true })).toBeEnabled();
  await pendingRoute?.abort().catch(() => {});
  await dialog.getByRole("button", { name: "关闭生成窗口", exact: true }).click();
  for (const title of ["取消前保留的百炼文章", SAMPLE_ARTICLES[0].title]) {
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  }
  await page.reload();
  await expect(page.getByRole("heading", { name: "取消前保留的百炼文章", exact: true })).toHaveCount(1);
  expect(calls).toBe(2);
});
