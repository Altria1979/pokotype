import { validateArticleContent, type Article } from "./articles";
import {
  defaultAiSettings,
  isAiProvider,
  isValidModelId,
  type AiProvider,
  type AiSettings,
} from "./ai-models";
import { KANA_GROUPS } from "./kana";
import type { ArticleGroupSize, ArticlePracticeMode } from "./article-practice";
import type { KeySoundType } from "./audio";

export type PracticeRecord = {
  id: string;
  mode: "kana" | "article";
  kanaPracticeMode?: "normal" | "weak";
  title: string;
  completedAt: string;
  correct: number;
  errors: number;
  durationMs: number;
  weakItems: string[];
  articlePracticeMode?: ArticlePracticeMode;
  articleGroupSize?: ArticleGroupSize;
};
export type KanaStats = Record<
  string,
  { seen: number; errors: number; durationMs: number }
>;
export type Preferences = {
  showRomaji: boolean;
  showKana: boolean;
  showTranslation: boolean;
  script: "hiragana" | "katakana";
  count: 20 | 50;
  groupIds: string[];
  keySoundEnabled: boolean;
  keySoundType: KeySoundType;
  kanaSpeechEnabled: boolean;
  articleSpeechEnabled: boolean;
  articleSegmentSpeechEnabled: boolean;
  articlePracticeMode: ArticlePracticeMode;
  articleGroupSize: ArticleGroupSize;
  keySoundVolume: number;
  speechVolume: number;
  speechVoiceURI: string;
  speechRate: 0.8 | 1 | 1.2;
  speechPitch: 1 | 1.15;
};
export const DEFAULT_PREFERENCES: Preferences = {
  showRomaji: true,
  showKana: true,
  showTranslation: true,
  script: "hiragana",
  count: 20,
  groupIds: KANA_GROUPS.filter((group) => group.category === "清音").map(
    (group) => group.id,
  ),
  keySoundEnabled: true,
  keySoundType: "percussive",
  kanaSpeechEnabled: true,
  articleSpeechEnabled: true,
  articleSegmentSpeechEnabled: true,
  articlePracticeMode: "full",
  articleGroupSize: 3,
  keySoundVolume: 0.25,
  speechVolume: 0.8,
  speechVoiceURI: "",
  speechRate: 1,
  speechPitch: 1.15,
};

const DATABASE = "pokotype-v1";
const PREFERENCES = "pokotype:preferences:v1";
const API_KEY = "pokotype:api-key:v1";
const BAILIAN_API_KEY = "pokotype:api-key:bailian:v1";
export const AI_SETTINGS_KEY = "pokotype:ai-settings:v1";
export const AI_SETTINGS_EVENT = "pokotype:ai-settings-changed";
export const API_KEY_EVENT = "pokotype:api-key-changed";
const TIMEOUT_MS = 5000;
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const nonnegative = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const text = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const articlePracticeMode = (value: unknown): value is ArticlePracticeMode =>
  value === "sentence" || value === "group" || value === "full";
const articleGroupSize = (value: unknown): value is ArticleGroupSize =>
  value === 3 || value === 5 || value === 10;

function validateStats(value: unknown): asserts value is KanaStats {
  if (
    !object(value) ||
    Object.values(value).some(
      (stat) =>
        !object(stat) ||
        !nonnegative(stat.seen) ||
        !nonnegative(stat.errors) ||
        !nonnegative(stat.durationMs),
    )
  ) {
    throw new Error("假名统计数据损坏，未覆盖已有数据。");
  }
}
function validateRecord(value: unknown): asserts value is PracticeRecord {
  if (
    !object(value) ||
    !text(value.id) ||
    !text(value.title) ||
    !text(value.completedAt) ||
    !Number.isFinite(Date.parse(value.completedAt)) ||
    !["kana", "article"].includes(String(value.mode)) ||
    (value.kanaPracticeMode !== undefined && !["normal", "weak"].includes(String(value.kanaPracticeMode))) ||
    !nonnegative(value.correct) ||
    !nonnegative(value.errors) ||
    !nonnegative(value.durationMs) ||
    (value.articlePracticeMode !== undefined && !articlePracticeMode(value.articlePracticeMode)) ||
    (value.articleGroupSize !== undefined && !articleGroupSize(value.articleGroupSize)) ||
    !Array.isArray(value.weakItems) ||
    !value.weakItems.every((item) => typeof item === "string")
  ) {
    throw new Error("练习记录格式无效，未保存。");
  }
}
function validateArticle(value: unknown): asserts value is Article {
  if (
    !object(value) ||
    !text(value.id) ||
    !text(value.createdAt) ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    !text(value.level) ||
    !text(value.topic) ||
    !["sample", "ai"].includes(String(value.source))
  ) {
    throw new Error("文章数据格式无效，未保存。");
  }
  validateArticleContent(value);
}
function envelope<T>(value: T) {
  return { version: 1, value };
}
function unwrap(value: unknown): unknown {
  if (!object(value) || value.version !== 1)
    throw new Error("本地数据版本不兼容，未覆盖已有数据。");
  return value.value;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("浏览器不支持本地数据库，当前内容未保存。"));
      return;
    }
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      reject(
        new Error("打开本地数据库超时，请关闭其他 Pokotype 标签页后重试。"),
      );
    }, TIMEOUT_MS);
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DATABASE, 1);
    } catch (error) {
      clearTimeout(timer);
      reject(error);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore("articles", { keyPath: "id" });
      db.createObjectStore("records", { keyPath: "id" });
      db.createObjectStore("stats");
    };
    request.onerror = () => {
      clearTimeout(timer);
      settled = true;
      reject(request.error ?? new Error("无法打开本地数据库。"));
    };
    request.onsuccess = () => {
      if (settled) {
        request.result.close();
        return;
      }
      clearTimeout(timer);
      settled = true;
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}

async function transaction<T>(
  stores: string[],
  mode: IDBTransactionMode,
  work: (
    tx: IDBTransaction,
    setResult: (result: T) => void,
    fail: (error: unknown) => void,
  ) => void,
): Promise<T> {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(stores, mode);
    } catch (error) {
      db.close();
      reject(error);
      return;
    }
    let result: T;
    let failure: unknown;
    let settled = false;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      db.close();
      if (error) reject(error);
      else resolve(result);
    };
    const fail = (error: unknown) => {
      failure = error;
      try {
        tx.abort();
      } catch {
        /* It may already have completed or aborted. */
      }
      finish(error);
    };
    const timer = setTimeout(
      () => fail(new Error("保存或读取本地数据超时，请重试。")),
      TIMEOUT_MS,
    );
    tx.oncomplete = () => finish();
    tx.onabort = () =>
      finish(
        failure ??
          tx.error ??
          new Error("本地数据操作被中止，当前内容未保存。"),
      );
    tx.onerror = () => {
      failure ??= tx.error ?? new Error("本地数据操作失败，当前内容未保存。");
    };
    try {
      work(
        tx,
        (value) => {
          result = value;
        },
        fail,
      );
    } catch (error) {
      fail(error);
    }
  });
}

export async function loadData(): Promise<{
  articles: Article[];
  records: PracticeRecord[];
  stats: KanaStats;
}> {
  return transaction(
    ["articles", "records", "stats"],
    "readonly",
    (tx, setResult, fail) => {
      const data: {
        articles: Article[];
        records: PracticeRecord[];
        stats: KanaStats;
      } = { articles: [], records: [], stats: {} };
      setResult(data);
      const articles = tx.objectStore("articles").getAll();
      articles.onsuccess = () => {
        try {
          data.articles = articles.result.map((stored) => {
            const item = unwrap(stored);
            validateArticle(item);
            return item;
          });
        } catch (error) {
          fail(error);
        }
      };
      const records = tx.objectStore("records").getAll();
      records.onsuccess = () => {
        try {
          data.records = records.result
            .map((stored) => {
              const item = unwrap(stored);
              validateRecord(item);
              return item;
            })
            .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
        } catch (error) {
          fail(error);
        }
      };
      const stats = tx.objectStore("stats").get("kana");
      stats.onsuccess = () => {
        try {
          const value = stats.result === undefined ? {} : unwrap(stats.result);
          validateStats(value);
          data.stats = value;
        } catch (error) {
          fail(error);
        }
      };
    },
  );
}

export async function saveArticle(article: Article): Promise<void> {
  validateArticle(article);
  return transaction(["articles"], "readwrite", (tx) => {
    tx.objectStore("articles").put({ id: article.id, ...envelope(article) });
  });
}
export async function deleteArticle(id: string): Promise<void> {
  return transaction(["articles"], "readwrite", (tx) => {
    tx.objectStore("articles").delete(id);
  });
}
export async function savePractice(
  record: PracticeRecord,
  deltaStats: KanaStats,
): Promise<void> {
  validateRecord(record);
  validateStats(deltaStats);
  return transaction(
    ["records", "stats"],
    "readwrite",
    (tx, _setResult, fail) => {
      const existing = tx.objectStore("records").get(record.id);
      existing.onsuccess = () => {
        if (existing.result !== undefined) return;
        const previous = tx.objectStore("stats").get("kana");
        previous.onsuccess = () => {
          try {
            const stats =
              previous.result === undefined ? {} : unwrap(previous.result);
            validateStats(stats);
            for (const [kana, delta] of Object.entries(deltaStats)) {
              const old = Object.hasOwn(stats, kana)
                ? stats[kana]
                : { seen: 0, errors: 0, durationMs: 0 };
              Object.defineProperty(stats, kana, {
                value: {
                  seen: old.seen + delta.seen,
                  errors: old.errors + delta.errors,
                  durationMs: old.durationMs + delta.durationMs,
                },
                enumerable: true,
                configurable: true,
                writable: true,
              });
            }
            validateStats(stats);
            tx.objectStore("stats").put(envelope(stats), "kana");
            tx.objectStore("records").add({
              id: record.id,
              ...envelope(record),
            });
          } catch (error) {
            fail(error);
          }
        };
      };
    },
  );
}

function local(): Storage {
  if (typeof localStorage === "undefined")
    throw new Error("浏览器不支持本地设置存储。");
  return localStorage;
}
const booleanPreference = (value: unknown) => typeof value === "boolean";
const volumePreference = (value: unknown) =>
  nonnegative(value) && value <= 1;
const preferenceValidators: Record<keyof Preferences, (value: unknown) => boolean> = {
  showRomaji: booleanPreference,
  showKana: booleanPreference,
  showTranslation: booleanPreference,
  script: (value) => value === "hiragana" || value === "katakana",
  count: (value) => value === 20 || value === 50,
  groupIds: (value) =>
    Array.isArray(value) &&
    value.every((id) => KANA_GROUPS.some((group) => group.id === id)),
  keySoundEnabled: booleanPreference,
  keySoundType: (value) => value === "percussive" || value === "electronic",
  kanaSpeechEnabled: booleanPreference,
  articleSpeechEnabled: booleanPreference,
  articleSegmentSpeechEnabled: booleanPreference,
  articlePracticeMode,
  articleGroupSize,
  keySoundVolume: volumePreference,
  speechVolume: volumePreference,
  speechVoiceURI: (value) => typeof value === "string",
  speechRate: (value) => value === 0.8 || value === 1 || value === 1.2,
  speechPitch: (value) => value === 1 || value === 1.15,
};
function validPreferences(value: unknown): value is Preferences {
  return object(value) && Object.entries(preferenceValidators).every(
    ([key, validate]) => validate(value[key]),
  );
}
export function loadPreferences(): Preferences {
  const raw = local().getItem(PREFERENCES);
  const defaults = () => ({
    ...DEFAULT_PREFERENCES,
    groupIds: [...DEFAULT_PREFERENCES.groupIds],
  });
  if (!raw) return defaults();
  try {
    const value = unwrap(JSON.parse(raw));
    if (!object(value)) return defaults();
    return Object.fromEntries(
      Object.entries(defaults()).map(([key, fallback]) => [
        key,
        preferenceValidators[key as keyof Preferences](value[key])
          ? value[key]
          : fallback,
      ]),
    ) as Preferences;
  } catch {
    return defaults();
  }
}
export function savePreferences(value: Preferences): void {
  if (!validPreferences(value)) throw new Error("偏好设置格式无效。");
  local().setItem(PREFERENCES, JSON.stringify(envelope(value)));
}
export function apiKeyStorageName(provider: AiProvider): string {
  if (!isAiProvider(provider)) throw new Error("AI 服务提供商无效。");
  return provider === "deepseek" ? API_KEY : BAILIAN_API_KEY;
}
export function loadApiKey(provider: AiProvider = "deepseek"): string {
  const storageName = apiKeyStorageName(provider);
  const raw = local().getItem(storageName);
  if (!raw) return "";
  const value = unwrap(JSON.parse(raw));
  if (typeof value !== "string")
    throw new Error("本地密钥格式无效，请重新设置。");
  return value;
}
export function saveApiKey(key: string, provider: AiProvider = "deepseek"): void {
  const storageName = apiKeyStorageName(provider);
  local().setItem(storageName, JSON.stringify(envelope(key.trim())));
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(API_KEY_EVENT, { detail: { provider } }));
}
export function clearApiKey(provider: AiProvider = "deepseek"): void {
  const storageName = apiKeyStorageName(provider);
  local().removeItem(storageName);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(API_KEY_EVENT, { detail: { provider } }));
}
export function loadAiSettings(): AiSettings {
  const raw = local().getItem(AI_SETTINGS_KEY);
  const defaults = defaultAiSettings();
  if (!raw) return defaults;
  try {
    const value = unwrap(JSON.parse(raw));
    if (!object(value)) return defaults;
    const models = object(value.models) ? value.models : {};
    return {
      provider: isAiProvider(value.provider) ? value.provider : defaults.provider,
      models: {
        deepseek: isValidModelId(models.deepseek)
          ? models.deepseek
          : defaults.models.deepseek,
        bailian: isValidModelId(models.bailian)
          ? models.bailian
          : defaults.models.bailian,
      },
    };
  } catch {
    return defaults;
  }
}
export function saveAiSettings(value: AiSettings): void {
  if (
    !object(value) ||
    !isAiProvider(value.provider) ||
    !object(value.models) ||
    !isValidModelId(value.models.deepseek) ||
    !isValidModelId(value.models.bailian)
  ) {
    throw new Error("AI 模型设置格式无效。");
  }
  const settings: AiSettings = {
    provider: value.provider,
    models: {
      deepseek: value.models.deepseek,
      bailian: value.models.bailian,
    },
  };
  local().setItem(AI_SETTINGS_KEY, JSON.stringify(envelope(settings)));
  if (typeof window !== "undefined") window.dispatchEvent(new Event(AI_SETTINGS_EVENT));
}
