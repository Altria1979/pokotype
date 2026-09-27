import { expect, test, type Route } from "@playwright/test";
import { SAMPLE_ARTICLES } from "../src/lib/articles";

test.describe("失败恢复回归", () => {
  test.setTimeout(10_000);
  test.use({ actionTimeout: 3000, navigationTimeout: 4000 });

  test("生成可取消、防重复提交且不覆盖已有文章", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "pokotype:api-key:v1",
        JSON.stringify({ version: 1, value: "test-only-no-real-key" }),
      );
    });
    let calls = 0;
    let pendingRoute: Route | undefined;
    await page.route("https://api.deepseek.com/**", async (route) => {
      calls++;
      expect(route.request().headers().authorization).toBe(
        "Bearer test-only-no-real-key",
      );
      if (calls > 1) {
        pendingRoute = route;
        return;
      }
      await route.fulfill({
        json: {
          choices: [{
            finish_reason: "stop",
            message: { content: JSON.stringify({
              title: "取消前已经保存的文章",
              sentences: SAMPLE_ARTICLES[0].sentences,
            }) },
          }],
        },
      });
    });
    await page.goto("/zh-CN/articles/");
    await page.getByRole("button", { name: "生成新文章", exact: true }).click();
    await page.getByRole("button", { name: "生成练习文章" }).click();
    const dialog = page.getByRole("dialog", { name: "AI 生成文章", exact: true });
    await expect(dialog.getByRole("heading", { name: "取消前已经保存的文章", exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "留在当前页", exact: true }).click();
    await page.getByRole("button", { name: "生成新文章", exact: true }).click();
    await page.getByRole("button", { name: "生成练习文章" }).click();
    await expect.poll(() => calls, { timeout: 2000 }).toBe(2);
    await expect(page.getByRole("button", { name: "正在创作你的文章…" })).toBeDisabled();
    // Exercise the handler guard as well as the disabled submit button.
    await page.locator("form").evaluate((form: HTMLFormElement) => {
      form.requestSubmit();
      form.requestSubmit();
    });
    await page.getByRole("button", { name: "取消生成", exact: true }).click();
    await expect(dialog.locator('.error[role="alert"]')).toContainText("已取消生成");
    await expect(page.getByRole("button", { name: "生成练习文章" })).toBeEnabled();
    expect(calls).toBe(2);
    await pendingRoute?.abort().catch(() => {});
    await dialog.getByRole("button", { name: "关闭生成窗口", exact: true }).click();
    await expect(page.getByRole("heading", { name: "取消前已经保存的文章", exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "取消前已经保存的文章", exact: true })).toBeVisible();
  });

  test("文章保存失败保留内存并支持重试持久化", async ({ page }) => {
    await page.goto(`/zh-CN/articles/?id=${SAMPLE_ARTICLES[0].id}`);
    await page.getByRole("button", { name: "修改标题与读音" }).click();
    await page.getByLabel("文章标题").fill("写入失败后恢复的文章");
    await page.evaluate(() => {
      const target = window as typeof window & { failArticleWrites?: boolean };
      target.failArticleWrites = true;
      const original = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        if (this.name === "articles" && target.failArticleWrites) {
          throw new DOMException("Simulated storage quota", "QuotaExceededError");
        }
        return original.apply(this, args);
      };
    });
    await page.getByRole("button", { name: "保存为副本", exact: true }).click();
    await expect(page.getByRole("heading", { name: "写入失败后恢复的文章", exact: true })).toBeVisible();
    await expect(page.locator('.error[role="alert"]')).toContainText("未能保存到浏览器");
    await page.getByRole("link", { name: "我的文章库", exact: true }).click();
    await page.getByRole("link").filter({ has: page.getByRole("heading", { name: "写入失败后恢复的文章", exact: true }) }).click();
    await page.evaluate(() => {
      (window as typeof window & { failArticleWrites?: boolean }).failArticleWrites = false;
    });
    await page.getByRole("button", { name: "重新保存", exact: true }).click();
    await expect(page.getByRole("button", { name: "重新保存", exact: true })).toBeEnabled();
    await expect(page.locator('.error[role="alert"]')).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("heading", { name: "写入失败后恢复的文章", exact: true })).toBeVisible();
  });

  test("离开文章详情后迟到的保存不得覆盖新导航", async ({ page }) => {
    await page.goto(`/zh-CN/articles/?id=${SAMPLE_ARTICLES[0].id}`);
    await page.getByRole("button", { name: "修改标题与读音" }).click();
    await page.getByLabel("文章标题").fill("后台完成保存的副本");
    await page.getByRole("link", { name: "练习记录", exact: true }).hover();
    await page.evaluate(() => {
      const original = IDBFactory.prototype.open;
      IDBFactory.prototype.open = function (...args) {
        const request = original.apply(this, args);
        Object.defineProperty(request, "onsuccess", {
          configurable: true,
          set(handler: ((this: IDBOpenDBRequest, event: Event) => unknown) | null) {
            if (handler) request.addEventListener("success", (event) => {
              setTimeout(() => handler.call(request, event), 500);
            }, { once: true });
          },
        });
        return request;
      };
    });
    await page.getByRole("button", { name: "保存为副本", exact: true }).click();
    await page.getByRole("link", { name: "练习记录", exact: true }).click();
    await expect(page).toHaveURL(/\/history\/$/);
    // Wait on the actual transaction completing, rather than an arbitrary sleep.
    await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("pokotype-v1", 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("articles", "readonly");
        const request = tx.objectStore("articles").getAll();
        request.onsuccess = () => {
          if (!request.result.some((item) => item.value.title === "后台完成保存的副本")) {
            reject(new Error("Expected delayed article save to complete"));
          }
        };
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    });
    await expect(page).toHaveURL(/\/history\/$/);
    await expect(page.getByRole("heading", { name: "练习记录", exact: true })).toBeVisible();
  });
});
