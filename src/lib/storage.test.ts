import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SAMPLE_ARTICLES } from "./articles";
import {
  clearApiKey,
  DEFAULT_PREFERENCES,
  deleteArticle,
  loadApiKey,
  loadData,
  loadPreferences,
  saveApiKey,
  saveArticle,
  savePractice,
  savePreferences,
  type PracticeRecord,
  type Preferences,
} from "./storage";

let localValues: Map<string, string>;
beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  localValues = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => localValues.get(key) ?? null,
    setItem: (key: string, value: string) => {
      localValues.set(key, value);
    },
    removeItem: (key: string) => {
      localValues.delete(key);
    },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const practice = (id: string): PracticeRecord => ({
  id,
  mode: "kana",
  title: "平假名练习",
  completedAt: "2026-09-26T10:00:00.000Z",
  correct: 20,
  errors: 2,
  durationMs: 10_000,
  weakItems: ["あ"],
});

async function overwriteStats(value: unknown) {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("pokotype-v1", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("stats", "readwrite");
      tx.objectStore("stats").put(value, "kana");
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error);
      };
    };
  });
}

describe("IndexedDB persistence", () => {
  it("starts empty, persists edits by article ID and deletes only the requested article", async () => {
    expect(await loadData()).toEqual({ articles: [], records: [], stats: {} });
    await saveArticle(SAMPLE_ARTICLES[0]);
    await saveArticle(SAMPLE_ARTICLES[1]);
    await saveArticle({ ...SAMPLE_ARTICLES[0], title: "修正后的标题" });
    let data = await loadData();
    expect(data.articles).toHaveLength(2);
    expect(
      data.articles.find((item) => item.id === SAMPLE_ARTICLES[0].id)?.title,
    ).toBe("修正后的标题");
    await deleteArticle(SAMPLE_ARTICLES[0].id);
    data = await loadData();
    expect(data.articles).toEqual([SAMPLE_ARTICLES[1]]);
  });
  it("atomically merges stats and makes repeated concurrent record IDs idempotent", async () => {
    const delta = { あ: { seen: 1, errors: 2, durationMs: 1000 } };
    await Promise.all([
      savePractice(practice("one"), delta),
      savePractice(practice("one"), delta),
    ]);
    await savePractice(practice("two"), {
      あ: { seen: 2, errors: 1, durationMs: 2000 },
      い: { seen: 1, errors: 0, durationMs: 100 },
    });
    const data = await loadData();
    expect(data.records).toHaveLength(2);
    expect(data.stats).toEqual({
      あ: { seen: 3, errors: 3, durationMs: 3000 },
      い: { seen: 1, errors: 0, durationMs: 100 },
    });
  });
  it("rejects bad input without writing a record or stats", async () => {
    await expect(
      savePractice(practice("bad"), {
        あ: { seen: -1, errors: 0, durationMs: 0 },
      }),
    ).rejects.toThrow("统计");
    await expect(
      saveArticle({ ...SAMPLE_ARTICLES[0], sentences: [] }),
    ).rejects.toThrow();
    expect(await loadData()).toEqual({ articles: [], records: [], stats: {} });
  });
  it("round trips article modes while preserving legacy records and idempotent saves", async () => {
    const legacy = { ...practice("legacy"), mode: "article" as const };
    const records: PracticeRecord[] = [
      legacy,
      { ...practice("sentence"), mode: "article", articlePracticeMode: "sentence" },
      { ...practice("full"), mode: "article", articlePracticeMode: "full" },
      ...([3, 5, 10] as const).map((size): PracticeRecord => ({
        ...practice(`group-${size}`), mode: "article", articlePracticeMode: "group", articleGroupSize: size,
      })),
    ];
    for (const record of records) {
      await Promise.all([savePractice(record, {}), savePractice(record, {})]);
    }
    const saved = (await loadData()).records;
    expect(saved).toHaveLength(records.length);
    expect(saved).toEqual(expect.arrayContaining(records));
    expect(saved.find((record) => record.id === "legacy")?.articlePracticeMode).toBeUndefined();
  });
  it.each([
    { articlePracticeMode: "paragraph" },
    { articlePracticeMode: null },
    { articleGroupSize: 4 },
    { articleGroupSize: "3" },
  ])("rejects invalid article record metadata %j", async (metadata) => {
    await expect(savePractice({ ...practice("invalid"), ...metadata } as PracticeRecord, {})).rejects.toThrow("记录格式");
    expect((await loadData()).records).toEqual([]);
  });
  it("rejects corrupt or future stored data and does not overwrite it on save", async () => {
    await loadData();
    await overwriteStats({ version: 2, value: {} });
    await expect(loadData()).rejects.toThrow("版本");
    await expect(savePractice(practice("blocked"), {})).rejects.toThrow("版本");
    await overwriteStats({ version: 1, value: {} });
    expect((await loadData()).records).toEqual([]);
  });
  it("reports unavailable storage and quota errors", async () => {
    vi.stubGlobal("indexedDB", undefined);
    await expect(loadData()).rejects.toThrow("不支持");
    vi.stubGlobal("indexedDB", new IDBFactory());
    await loadData();
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });
    await expect(saveArticle(SAMPLE_ARTICLES[0])).rejects.toThrow(
      "Quota exceeded",
    );
  });
  it("rolls back the stats write when storing the record fails", async () => {
    await loadData();
    const add = vi
      .spyOn(IDBObjectStore.prototype, "add")
      .mockImplementation(() => {
        throw new DOMException("Record quota exceeded", "QuotaExceededError");
      });
    await expect(
      savePractice(practice("rollback"), {
        あ: { seen: 1, errors: 1, durationMs: 100 },
      }),
    ).rejects.toThrow("Record quota");
    add.mockRestore();
    expect(await loadData()).toEqual({ articles: [], records: [], stats: {} });
  });
  it("bounds a stalled database open", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("indexedDB", { open: () => ({}) });
    const assertion = expect(loadData()).rejects.toThrow("超时");
    await vi.advanceTimersByTimeAsync(5001);
    await assertion;
  });
});

describe("local preferences and key", () => {
  it("loads defaults without writing and keeps default arrays independent", () => {
    const first = loadPreferences();
    first.groupIds.length = 0;
    expect(loadPreferences()).toEqual(DEFAULT_PREFERENCES);
    expect(localValues.size).toBe(0);
  });
  it("saves preferences and falls back on corruption without replacing it", () => {
    const preferences = {
      ...DEFAULT_PREFERENCES,
      count: 50 as const,
      showRomaji: false,
    };
    savePreferences(preferences);
    expect(loadPreferences()).toEqual(preferences);
    localValues.set("pokotype:preferences:v1", "{broken");
    expect(loadPreferences()).toEqual(DEFAULT_PREFERENCES);
    expect(localValues.get("pokotype:preferences:v1")).toBe("{broken");
  });
  it("defaults old or corrupt article choices to full practice and three sentences without rewriting storage", () => {
    for (const metadata of [{}, { articlePracticeMode: "paragraph", articleGroupSize: 4 }]) {
      const raw = JSON.stringify({ version: 1, value: { articleSpeechEnabled: false, ...metadata } });
      localValues.set("pokotype:preferences:v1", raw);
      expect(loadPreferences()).toMatchObject({
        articlePracticeMode: "full", articleGroupSize: 3, articleSpeechEnabled: false,
      });
      expect(localValues.get("pokotype:preferences:v1")).toBe(raw);
    }
  });
  it("remembers every article mode and group size independently of the sentence sound preferences", () => {
    for (const mode of ["sentence", "group", "full"] as const) {
      for (const size of [3, 5, 10] as const) {
        const preferences: Preferences = {
          ...DEFAULT_PREFERENCES, articlePracticeMode: mode, articleGroupSize: size,
          articleSpeechEnabled: true, articleSegmentSpeechEnabled: false,
        };
        savePreferences(preferences);
        expect(loadPreferences()).toEqual(preferences);
      }
    }
  });
  it("stores, replaces and clears only the API key", () => {
    expect(loadApiKey()).toBe("");
    savePreferences(DEFAULT_PREFERENCES);
    saveApiKey(" mock-credential ");
    expect(loadApiKey()).toBe("mock-credential");
    saveApiKey("replacement-credential");
    expect(loadApiKey()).toBe("replacement-credential");
    clearApiKey();
    expect(loadApiKey()).toBe("");
    expect(localValues.has("pokotype:preferences:v1")).toBe(true);
  });
  it("fills new sound defaults for v1 preferences without changing earlier selections", () => {
    const legacy = {
      showRomaji: false,
      showKana: false,
      showTranslation: false,
      script: "katakana",
      count: 50,
      groupIds: [DEFAULT_PREFERENCES.groupIds[1]],
    };
    const raw = JSON.stringify({ version: 1, value: legacy });
    localValues.set("pokotype:preferences:v1", raw);
    expect(loadPreferences()).toEqual({ ...DEFAULT_PREFERENCES, ...legacy });
    expect(localValues.get("pokotype:preferences:v1")).toBe(raw);
  });
  it("round trips independent sound switches, silent volumes, voice URI and speed", () => {
    const preferences: Preferences = {
      ...DEFAULT_PREFERENCES,
      keySoundEnabled: false,
      kanaSpeechEnabled: true,
      articleSpeechEnabled: false,
      articleSegmentSpeechEnabled: false,
      keySoundVolume: 0,
      speechVolume: 1,
      speechVoiceURI: "ja-JP-local-voice",
      speechRate: 0.8,
      speechPitch: 1,
    };
    savePreferences(preferences);
    expect(loadPreferences()).toEqual(preferences);
    savePreferences({ ...preferences, speechRate: 1.2 });
    expect(loadPreferences().speechRate).toBe(1.2);
  });
  it("adds segment speech and light pitch to existing sound preferences without changing a chosen voice", () => {
    const previousSoundSettings = {
      keySoundEnabled: false,
      kanaSpeechEnabled: false,
      articleSpeechEnabled: false,
      keySoundVolume: 0.4,
      speechVolume: 0.6,
      speechVoiceURI: "chosen-voice",
      speechRate: 0.8,
    };
    localValues.set("pokotype:preferences:v1", JSON.stringify({ version: 1, value: previousSoundSettings }));
    expect(loadPreferences()).toEqual({ ...DEFAULT_PREFERENCES, ...previousSoundSettings });
    expect(loadPreferences()).toMatchObject({ articleSegmentSpeechEnabled: true, speechPitch: 1.15 });
  });
  it("repairs only corrupt fields and preserves valid selections without writing", () => {
    const raw = JSON.stringify({ version: 1, value: {
      ...DEFAULT_PREFERENCES,
      count: 50,
      showRomaji: false,
      keySoundEnabled: false,
      kanaSpeechEnabled: "false",
      articleSpeechEnabled: false,
      keySoundVolume: -0.5,
      speechVolume: 0.4,
      speechVoiceURI: "missing-but-remembered-voice",
      speechRate: 2,
      speechPitch: "1.15",
      articleSegmentSpeechEnabled: "false",
    } });
    localValues.set("pokotype:preferences:v1", raw);
    expect(loadPreferences()).toEqual({
      ...DEFAULT_PREFERENCES,
      count: 50,
      showRomaji: false,
      keySoundEnabled: false,
      articleSpeechEnabled: false,
      speechVolume: 0.4,
      speechVoiceURI: "missing-but-remembered-voice",
    });
    expect(localValues.get("pokotype:preferences:v1")).toBe(raw);
  });
  it.each([
    ["keySoundEnabled", "true"],
    ["kanaSpeechEnabled", 1],
    ["articleSpeechEnabled", null],
    ["articleSegmentSpeechEnabled", "false"],
    ["keySoundVolume", -0.01],
    ["keySoundVolume", 1.01],
    ["speechVolume", Number.NaN],
    ["speechVolume", Number.POSITIVE_INFINITY],
    ["speechVolume", "0.8"],
    ["speechVoiceURI", null],
    ["speechRate", 0.9],
    ["speechRate", "1"],
    ["speechPitch", "1.15"],
    ["speechPitch", 1.2],
    ["speechPitch", Number.NaN],
    ["articlePracticeMode", "paragraph"],
    ["articlePracticeMode", null],
    ["articleGroupSize", 4],
    ["articleGroupSize", "3"],
  ])("rejects invalid %s on save without overwriting preferences", (field, value) => {
    savePreferences(DEFAULT_PREFERENCES);
    const before = localValues.get("pokotype:preferences:v1");
    expect(() => savePreferences({ ...DEFAULT_PREFERENCES, [field]: value } as Preferences)).toThrow("偏好设置格式无效");
    expect(localValues.get("pokotype:preferences:v1")).toBe(before);
  });
  it("propagates denied localStorage access rather than pretending to save", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new DOMException("Denied", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("Denied", "SecurityError");
      },
    });
    expect(() => loadPreferences()).toThrow("Denied");
    expect(() => saveApiKey("mock-credential")).toThrow("Denied");
  });
});
