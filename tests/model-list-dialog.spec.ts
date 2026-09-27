import { expect, test, type Page, type Route } from "@playwright/test";

const providers = {
  deepseek: {
    name: "DeepSeek",
    endpoint: "https://api.deepseek.com/models",
    storage: "pokotype:api-key:v1",
    key: "test-only-model-list-deepseek-key",
    models: ["deepseek-flash", "deepseek-v4-pro", "deepseek-list-preview"],
  },
  bailian: {
    name: "阿里百炼",
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/models",
    storage: "pokotype:api-key:bailian:v1",
    key: "test-only-model-list-bailian-key",
    models: ["qwen3.8-flash", "qwen3.7-flash"],
  },
} as const;

const providerApi = /^https:\/\/(?:api\.deepseek\.com|dashscope\.aliyuncs\.com)\//;

function keyCard(page: Page, name: keyof typeof providers = "deepseek") {
  return page.getByRole("region", { name: `${providers[name].name} API 密钥`, exact: true });
}

async function respondWithModels(route: Route, models: readonly string[]) {
  await route.fulfill({ json: { object: "list", data: models.map((id) => ({ id })) } });
}

async function checkDraft(page: Page, name: keyof typeof providers = "deepseek") {
  const card = keyCard(page, name);
  await card.getByLabel(`${providers[name].name} API 密钥`, { exact: true }).fill(providers[name].key);
  await card.getByRole("button", { name: "检查连接", exact: true }).click();
  await expect(card.getByRole("button", { name: "查看模型列表", exact: true })).toBeVisible();
  return card;
}

test("两家草稿分别查看本次模型列表，不另发请求或保存，关闭、Esc 和遮罩归还焦点", async ({ page }) => {
  const requests: { url: string; method: string; authorization: string }[] = [];
  await page.route(providerApi, async (route) => {
    const request = route.request();
    requests.push({ url: request.url(), method: request.method(), authorization: request.headers().authorization });
    const provider = request.url() === providers.deepseek.endpoint ? providers.deepseek : providers.bailian;
    await respondWithModels(route, provider.models);
  });
  await page.goto("/zh-CN/settings/");
  for (const name of ["deepseek", "bailian"] as const) {
    await expect(keyCard(page, name).getByRole("button", { name: "查看模型列表", exact: true })).toHaveCount(0);
    await checkDraft(page, name);
  }

  for (const [name, closeMethod] of [["deepseek", "button"], ["bailian", "escape"], ["deepseek", "backdrop"]] as const) {
    const provider = providers[name];
    const other = providers[name === "deepseek" ? "bailian" : "deepseek"];
    const trigger = keyCard(page, name).getByRole("button", { name: "查看模型列表", exact: true });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: `${provider.name} 模型列表`, exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(`${provider.models.length} 个模型`);
    const list = dialog.getByRole("region", { name: "模型列表", exact: true });
    for (const model of provider.models) await expect(list.getByText(model, { exact: true })).toBeVisible();
    for (const model of other.models) await expect(list.getByText(model, { exact: true })).toHaveCount(0);
    await expect(dialog).not.toContainText(provider.key);
    if (closeMethod === "button") await dialog.getByRole("button", { name: "关闭模型列表", exact: true }).click();
    else if (closeMethod === "escape") await page.keyboard.press("Escape");
    else {
      const box = (await dialog.boundingBox())!;
      expect(box.x).toBeGreaterThan(1);
      await page.mouse.click(box.x / 2, box.y + 10);
    }
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
  }
  expect(requests).toEqual([
    { url: providers.deepseek.endpoint, method: "GET", authorization: `Bearer ${providers.deepseek.key}` },
    { url: providers.bailian.endpoint, method: "GET", authorization: `Bearer ${providers.bailian.key}` },
  ]);
  for (const name of ["deepseek", "bailian"] as const) {
    expect(await page.evaluate((key) => localStorage.getItem(key), providers[name].storage)).toBeNull();
    await expect(keyCard(page, name).getByRole("status")).toContainText("尚未保存");
  }
});

test("重新检查立即使旧列表失效，检查失败后不能再打开旧列表", async ({ page }) => {
  let calls = 0;
  let pendingRoute: Route | undefined;
  await page.route(providerApi, async (route) => {
    calls++;
    if (calls === 1) await respondWithModels(route, providers.deepseek.models);
    else pendingRoute = route;
  });
  await page.goto("/zh-CN/settings/");
  const card = await checkDraft(page);
  const trigger = card.getByRole("button", { name: "查看模型列表", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "DeepSeek 模型列表", exact: true });
  await dialog.getByRole("button", { name: "关闭模型列表", exact: true }).click();
  await card.getByRole("button", { name: "检查连接", exact: true }).click();
  await expect.poll(() => calls).toBe(2);
  await expect(trigger).toHaveCount(0);
  await expect(dialog).not.toBeVisible();
  await pendingRoute!.fulfill({ status: 401, json: { error: { message: "private-model-list-error" } } });
  await expect(card.getByRole("alert")).toBeVisible();
  await expect(card).not.toContainText("private-model-list-error");
  await expect(trigger).toHaveCount(0);
  await expect(card.getByText(/密钥验证通过/)).toHaveCount(0);
  expect(calls).toBe(2);
});

test("编辑密钥使列表失效，保存已验证的同一草稿保留列表，清除密钥后失效", async ({ page }) => {
  let calls = 0;
  await page.route(providerApi, async (route) => {
    calls++;
    await respondWithModels(route, providers.deepseek.models);
  });
  await page.goto("/zh-CN/settings/");
  const card = await checkDraft(page);
  const input = card.getByLabel("DeepSeek API 密钥", { exact: true });
  const trigger = card.getByRole("button", { name: "查看模型列表", exact: true });
  await input.fill("test-only-model-list-replacement-key");
  await expect(trigger).toHaveCount(0);

  await card.getByRole("button", { name: "检查连接", exact: true }).click();
  await expect(trigger).toBeVisible();
  await card.getByRole("button", { name: "保存密钥", exact: true }).click();
  await expect(trigger).toBeVisible();
  await expect(card.getByRole("button", { name: "替换密钥", exact: true })).toBeVisible();
  await expect(card.getByText("检查通过", { exact: true })).toBeVisible();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "DeepSeek 模型列表", exact: true });
  await expect(dialog).toContainText(`${providers.deepseek.models.length} 个模型`);
  await expect(dialog.getByRole("region", { name: "模型列表", exact: true }).locator("code")).toHaveText([...providers.deepseek.models]);
  await dialog.getByRole("button", { name: "关闭模型列表", exact: true }).click();
  expect(calls).toBe(2);

  await card.getByRole("button", { name: "清除密钥", exact: true }).click();
  await expect(trigger).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "DeepSeek 模型列表", exact: true })).not.toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), providers.deepseek.storage)).toBeNull();
  expect(calls).toBe(2);
});

test("外部存储清除密钥时关闭已打开的列表，移除旧入口并恢复页面滚动", async ({ page }) => {
  await page.route(providerApi, (route) => respondWithModels(route, providers.deepseek.models));
  await page.goto("/zh-CN/settings/");
  const card = keyCard(page);
  await card.getByLabel("DeepSeek API 密钥", { exact: true }).fill(providers.deepseek.key);
  await card.getByRole("button", { name: "保存密钥", exact: true }).click();
  await expect(card.getByRole("button", { name: "替换密钥", exact: true })).toBeVisible();
  await card.getByRole("button", { name: "检查连接", exact: true }).click();
  const trigger = card.getByRole("button", { name: "查看模型列表", exact: true });
  await expect(trigger).toBeVisible();
  const initialOverflow = await page.evaluate(() => document.body.style.overflow);
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "DeepSeek 模型列表", exact: true });
  await expect(dialog).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("hidden");

  await page.evaluate((key) => {
    localStorage.removeItem(key);
    window.dispatchEvent(new StorageEvent("storage", { key, newValue: null, storageArea: localStorage }));
  }, providers.deepseek.storage);
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toHaveCount(0);
  await expect(card.getByRole("button", { name: "清除密钥", exact: true })).toBeDisabled();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe(initialOverflow);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.mouse.move(10, 10);
  await page.mouse.wheel(0, 500);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 560 }]) {
  test(`${viewport.width}px 长模型列表在弹窗内滚动到末条，Esc 关闭恢复焦点且页面不溢出`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const models = Array.from({ length: 80 }, (_, index) => `qwen-list-model-${String(index + 1).padStart(3, "0")}`);
    models[1] = `qwen-long-model-${"x".repeat(111)}`;
    let calls = 0;
    await page.route(providerApi, async (route) => {
      calls++;
      await respondWithModels(route, models);
    });
    await page.goto("/zh-CN/settings/");
    const card = await checkDraft(page, "bailian");
    const trigger = card.getByRole("button", { name: "查看模型列表", exact: true });
    const initialOverflow = await page.evaluate(() => document.body.style.overflow);
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "阿里百炼 模型列表", exact: true });
    await expect(dialog).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("hidden");
    await expect(dialog).toContainText("80 个模型");
    const list = dialog.getByRole("region", { name: "模型列表", exact: true });
    await expect.poll(() => list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
    await expect.poll(() => list.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expect(list.getByText(models[0], { exact: true })).toBeInViewport();
    await expect(list.getByText(models.at(-1)!, { exact: true })).not.toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath(`model-list-${viewport.width}-start.png`) });
    await list.focus();
    await expect(list).toBeFocused();
    await list.press("End");
    await expect(list.getByText(models.at(-1)!, { exact: true })).toBeInViewport();
    await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await page.screenshot({ path: testInfo.outputPath(`model-list-${viewport.width}-end.png`) });

    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe(initialOverflow);
    expect(calls).toBe(1);
  });
}
