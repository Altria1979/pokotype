import { expect, test, type Page } from "@playwright/test";
import { SAMPLE_ARTICLES, type Article } from "../src/lib/articles";
import type { KanaStats, PracticeRecord } from "../src/lib/storage";

const preferencesKey = "pokotype:preferences:v1";
type StorageFaults = { articleWrites: boolean; articleDeletes: boolean; recordWrites: boolean; preferences: boolean };
type FaultWindow = Window & { i18nPersistenceFaults: StorageFaults & { deleteAttempts: number; recordAttempts: number } };
type PracticeSnapshot = { records: PracticeRecord[]; stats: KanaStats };

function switcher(page: Page, name = "界面语言") {
  return page.getByRole("combobox", { name, exact: true });
}

async function installStorageFaults(page: Page, failures: Partial<StorageFaults>) {
  await page.evaluate(({ failures, preferencesKey }) => {
    const target = window as unknown as FaultWindow;
    target.i18nPersistenceFaults = {
      articleWrites: false,
      articleDeletes: false,
      recordWrites: false,
      preferences: false,
      deleteAttempts: 0,
      recordAttempts: 0,
      ...failures,
    };
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === "articles" && target.i18nPersistenceFaults.articleWrites) {
        throw new DOMException("Simulated article write failure", "QuotaExceededError");
      }
      return put.apply(this, args);
    };
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args) {
      if (this.name === "records") {
        target.i18nPersistenceFaults.recordAttempts += 1;
        if (target.i18nPersistenceFaults.recordWrites) {
          throw new DOMException("Simulated practice record write failure", "QuotaExceededError");
        }
      }
      return add.apply(this, args);
    };
    const remove = IDBObjectStore.prototype.delete;
    IDBObjectStore.prototype.delete = function (...args) {
      if (this.name === "articles") {
        target.i18nPersistenceFaults.deleteAttempts += 1;
        if (target.i18nPersistenceFaults.articleDeletes) {
          throw new DOMException("Simulated article delete failure", "UnknownError");
        }
      }
      return remove.apply(this, args);
    };
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === preferencesKey && target.i18nPersistenceFaults.preferences) {
        throw new DOMException("Simulated preferences write failure", "QuotaExceededError");
      }
      return setItem.call(this, key, value);
    };
  }, { failures, preferencesKey });
}

async function setStorageFaults(page: Page, failures: Partial<StorageFaults>) {
  await page.evaluate((failures) => {
    Object.assign((window as unknown as FaultWindow).i18nPersistenceFaults, failures);
  }, failures);
}

async function seedArticle(page: Page, article: Article) {
  await page.goto("/zh-CN/");
  await expect(switcher(page)).toBeEnabled();
  await page.evaluate((article) => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open("pokotype-v1", 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const database = open.result;
      const transaction = database.transaction("articles", "readwrite");
      transaction.objectStore("articles").put({ id: article.id, version: 1, value: article });
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onabort = () => { database.close(); reject(transaction.error); };
    };
  }), article);
  await page.goto(`/zh-CN/articles/?id=${article.id}`);
  await expect(page.getByRole("heading", { name: article.title, exact: true })).toBeVisible();
  await expect(switcher(page)).toBeEnabled();
}

async function storedArticle(page: Page, id: string): Promise<Article | undefined> {
  return page.evaluate((id) => new Promise<Article | undefined>((resolve, reject) => {
    const open = indexedDB.open("pokotype-v1", 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const database = open.result;
      const read = database.transaction("articles", "readonly").objectStore("articles").get(id);
      read.onerror = () => { database.close(); reject(read.error); };
      read.onsuccess = () => { database.close(); resolve(read.result?.value); };
    };
  }), id);
}

async function practiceSnapshot(page: Page): Promise<PracticeSnapshot> {
  return page.evaluate(() => new Promise<PracticeSnapshot>((resolve, reject) => {
    const open = indexedDB.open("pokotype-v1", 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const database = open.result;
      const transaction = database.transaction(["records", "stats"], "readonly");
      const result: PracticeSnapshot = { records: [], stats: {} };
      const records = transaction.objectStore("records").getAll();
      records.onsuccess = () => { result.records = records.result.map((entry) => entry.value); };
      const stats = transaction.objectStore("stats").get("kana");
      stats.onsuccess = () => { result.stats = stats.result?.value ?? {}; };
      transaction.oncomplete = () => { database.close(); resolve(result); };
      transaction.onabort = () => { database.close(); reject(transaction.error); };
    };
  }));
}

async function completeKanaSession(page: Page) {
  let typedCharacters = 0;
  for (let index = 0; index < 20; index++) {
    await expect(page.getByText(`${index + 1} / 20`, { exact: true })).toBeVisible();
    const remaining = (await page.getByLabel("输入进度").locator("[data-romaji-pending]").allTextContents()).join("");
    expect(remaining.length).toBeGreaterThan(0);
    typedCharacters += remaining.length;
    await page.keyboard.type(remaining);
  }
  await expect(page.getByRole("heading", { name: "又向前了一小步", exact: true })).toBeVisible();
  return typedCharacters;
}

async function attemptDelete(page: Page) {
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "删除文章", exact: true }).click();
  await expect(page.locator('.error[role="alert"]')).toContainText("删除失败，文章仍保留");
}

test("持久文章删除失败不锁定语言，也不会被其他保存任务的重试再次删除", async ({ page }) => {
  const article: Article = {
    ...SAMPLE_ARTICLES[0],
    id: "i18n-persisted-delete-failure",
    title: "删除失败后应保留的已存文章",
    source: "ai",
  };
  await seedArticle(page, article);
  await installStorageFaults(page, { articleDeletes: true });
  await attemptDelete(page);
  await expect(switcher(page)).toBeEnabled();
  await expect(page.getByTestId("pending-save")).toHaveCount(0);
  expect(await storedArticle(page, article.id)).toMatchObject({ title: article.title });
  await page.getByRole("button", { name: "关闭提示", exact: true }).click();
  await expect(switcher(page)).toBeEnabled();

  // Keep the same provider mounted so any incorrectly retained delete task survives.
  await page.getByRole("navigation", { name: "主导航", exact: true })
    .getByRole("link", { name: "设置", exact: true }).click();
  await setStorageFaults(page, { articleDeletes: false, preferences: true });
  await page.getByRole("checkbox", { name: /^显示罗马音提示/ }).uncheck();
  await expect(page.getByTestId("pending-save")).toBeVisible();
  await setStorageFaults(page, { preferences: false });
  await page.getByTestId("pending-save").getByRole("button", { name: "重试保存", exact: true }).click();
  await expect(switcher(page)).toBeEnabled();
  expect(await page.evaluate(() => (window as unknown as FaultWindow).i18nPersistenceFaults.deleteAttempts)).toBe(1);
  expect(await storedArticle(page, article.id)).toMatchObject({ title: article.title });
  await switcher(page).selectOption("en");
  await expect(page).toHaveURL(/\/en\/settings\/$/);
  await page.goto(`/en/articles/?id=${article.id}`);
  await expect(page.getByRole("heading", { name: article.title, exact: true })).toBeVisible();
});

test("未落盘文章删除失败仍保留原保存任务，重试保存后解锁并跨语言保留", async ({ page }) => {
  const title = "删除失败后仍需保存的内存文章";
  await page.goto(`/zh-CN/articles/?id=${SAMPLE_ARTICLES[0].id}`);
  await page.getByRole("button", { name: "修改标题与读音", exact: true }).click();
  await page.getByLabel("文章标题", { exact: true }).fill(title);
  await installStorageFaults(page, { articleWrites: true, articleDeletes: true });
  await page.getByRole("button", { name: "保存为副本", exact: true }).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect(page).not.toHaveURL(new RegExp(`id=${SAMPLE_ARTICLES[0].id}$`));
  const id = new URL(page.url()).searchParams.get("id");
  expect(id).toBeTruthy();
  expect(await storedArticle(page, id!)).toBeUndefined();
  await expect(switcher(page)).toBeDisabled();

  await attemptDelete(page);
  await page.getByRole("button", { name: "关闭提示", exact: true }).click();
  await expect(page.getByTestId("pending-save")).toBeVisible();
  await expect(switcher(page)).toBeDisabled();
  await setStorageFaults(page, { articleWrites: false, articleDeletes: false });
  await page.getByTestId("pending-save").getByRole("button", { name: "重试保存", exact: true }).click();
  await expect(switcher(page)).toBeEnabled();
  await expect(page.getByTestId("pending-save")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as FaultWindow).i18nPersistenceFaults.deleteAttempts)).toBe(1);
  expect(await storedArticle(page, id!)).toMatchObject({ title });
  await switcher(page).selectOption("ja");
  await expect(page).toHaveURL(/\/ja\/articles\/\?id=/);
  await page.reload();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect(switcher(page, "表示言語")).toBeEnabled();
});

test("偏好保存失败关闭提示仍锁定语言，恢复后重试解锁且刷新保留", async ({ page }) => {
  await page.goto("/zh-CN/settings/");
  await expect(switcher(page)).toBeEnabled();
  await installStorageFaults(page, { preferences: true });
  const romaji = page.getByRole("checkbox", { name: /^显示罗马音提示/ });
  await expect(romaji).toBeChecked();
  await romaji.uncheck();
  await expect(romaji).not.toBeChecked();
  await expect(page.locator('.error[role="alert"]')).toContainText("偏好设置未能保存");
  await page.getByRole("button", { name: "关闭提示", exact: true }).click();
  await expect(page.locator('.error[role="alert"]')).toHaveCount(0);
  await expect(page.getByTestId("pending-save")).toBeVisible();
  await expect(switcher(page)).toBeDisabled();

  await setStorageFaults(page, { preferences: false });
  await page.getByTestId("pending-save").getByRole("button", { name: "重试保存", exact: true }).click();
  await expect(page.getByTestId("pending-save")).toHaveCount(0);
  await expect(switcher(page)).toBeEnabled();
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).value.showRomaji, preferencesKey)).toBe(false);
  await switcher(page).selectOption("en");
  await expect(page).toHaveURL(/\/en\/settings\/$/);
  await expect(page.getByRole("checkbox", { name: /^Show romaji hints/ })).not.toBeChecked();
  await page.reload();
  await expect(page.getByRole("checkbox", { name: /^Show romaji hints/ })).not.toBeChecked();
  await expect(switcher(page, "Interface language")).toBeEnabled();
});


test("真实练习成绩保存失败退出后仍锁定，重试后跨语言只保留一条成绩且统计不重复", async ({ page }) => {
  await page.addInitScript((key) => {
    localStorage.setItem(key, JSON.stringify({
      version: 1,
      value: { kanaSpeechEnabled: false, keySoundEnabled: false },
    }));
  }, preferencesKey);
  await page.goto("/zh-CN/");
  await expect(switcher(page)).toBeEnabled();
  await installStorageFaults(page, { recordWrites: true });
  await page.getByRole("button", { name: "开始练习 20 题", exact: true }).click();
  await expect(page).toHaveURL(/\/zh-CN\/practice\/\?session=/);
  await expect(page.getByRole("region", { name: "五十音打字练习", exact: true })).toBeFocused();
  await page.keyboard.press("q");
  await expect(page.getByRole("status")).toContainText("这个按键不匹配");
  const correct = await completeKanaSession(page);
  await expect(page.locator('.error[role="alert"]')).toContainText("本次成绩尚未保存到浏览器");
  await expect(page.getByRole("heading", { name: "又向前了一小步", exact: true })).toBeVisible();
  expect(await practiceSnapshot(page)).toEqual({ records: [], stats: {} });
  await page.getByRole("button", { name: "关闭提示", exact: true }).click();
  await page.getByRole("button", { name: "返回练习设置", exact: true }).click();
  await expect(page).toHaveURL(/\/zh-CN\/$/);
  await expect(switcher(page)).toBeDisabled();
  await expect(page.getByTestId("pending-save")).toBeVisible();

  await page.getByRole("navigation", { name: "主导航", exact: true })
    .getByRole("link", { name: "练习记录", exact: true }).click();
  await expect(page.getByRole("row")).toHaveCount(2);
  await expect(page.getByRole("cell", { name: /假名\s*五十音 · 自由练习/ })).toBeVisible();
  await expect(switcher(page)).toBeDisabled();
  await setStorageFaults(page, { recordWrites: false });
  await page.getByTestId("pending-save").getByRole("button", { name: "重试保存", exact: true }).click();
  await expect(switcher(page)).toBeEnabled();
  await expect(page.getByTestId("pending-save")).toHaveCount(0);
  const saved = await practiceSnapshot(page);
  expect(saved.records).toHaveLength(1);
  expect(saved.records[0]).toMatchObject({ mode: "kana", kanaPracticeMode: "normal", correct, errors: 1 });
  expect(Object.values(saved.stats).reduce((total, value) => total + value.seen, 0)).toBe(20);
  expect(Object.values(saved.stats).reduce((total, value) => total + value.errors, 0)).toBe(1);
  expect(await page.evaluate(() => (window as unknown as FaultWindow).i18nPersistenceFaults.recordAttempts)).toBe(2);
  await expect(page.getByRole("row")).toHaveCount(2);

  await switcher(page).selectOption("en");
  await expect(page).toHaveURL(/\/en\/history\/$/);
  await expect(page.getByRole("row")).toHaveCount(2);
  await expect(page.getByRole("cell", { name: /Kana\s*Kana · Free practice/ })).toBeVisible();
  expect(await practiceSnapshot(page)).toEqual(saved);
  await page.reload();
  await expect(page.getByRole("row")).toHaveCount(2);
  await expect(page.getByRole("cell", { name: /Kana\s*Kana · Free practice/ })).toBeVisible();
  await expect(switcher(page, "Interface language")).toBeEnabled();
  expect(await practiceSnapshot(page)).toEqual(saved);
});
