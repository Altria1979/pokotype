import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultAiSettings, type AiProvider, type AiSettings } from "./ai-models";
import {
  clearApiKey,
  loadAiSettings,
  loadApiKey,
  saveAiSettings,
  saveApiKey,
} from "./storage";

const DEEPSEEK_KEY = "pokotype:api-key:v1";
const BAILIAN_KEY = "pokotype:api-key:bailian:v1";
const SETTINGS_KEY = "pokotype:ai-settings:v1";
let values: Map<string, string>;

beforeEach(() => {
  values = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("provider credentials", () => {
  it("reads the existing DeepSeek key without migration or a provider argument", () => {
    const raw = JSON.stringify({ version: 1, value: "legacy-test-credential" });
    values.set(DEEPSEEK_KEY, raw);
    expect(loadApiKey()).toBe("legacy-test-credential");
    expect(loadApiKey("deepseek")).toBe("legacy-test-credential");
    expect(loadApiKey("bailian")).toBe("");
    expect(values.get(DEEPSEEK_KEY)).toBe(raw);
    expect(values.size).toBe(1);
  });

  it("saves, replaces and clears each credential independently", () => {
    const settings = defaultAiSettings();
    saveAiSettings(settings);
    values.set("pokotype:preferences:v1", "untouched-preferences");
    saveApiKey(" test-deepseek ");
    saveApiKey(" test-bailian ", "bailian");
    expect(loadApiKey()).toBe("test-deepseek");
    expect(loadApiKey("bailian")).toBe("test-bailian");
    expect(JSON.parse(values.get(BAILIAN_KEY)!)).toEqual({ version: 1, value: "test-bailian" });
    saveApiKey("replaced-bailian", "bailian");
    expect(loadApiKey("bailian")).toBe("replaced-bailian");
    expect(loadApiKey()).toBe("test-deepseek");
    clearApiKey("bailian");
    expect(loadApiKey("bailian")).toBe("");
    expect(loadApiKey()).toBe("test-deepseek");
    saveApiKey("test-bailian", "bailian");
    clearApiKey();
    expect(loadApiKey()).toBe("");
    expect(loadApiKey("bailian")).toBe("test-bailian");
    expect(loadAiSettings()).toEqual(settings);
    expect(values.get("pokotype:preferences:v1")).toBe("untouched-preferences");
  });

  it.each(["unknown", "constructor", "__proto__", "", null, 1])(
    "rejects unsupported provider %s without accessing or changing a credential",
    (provider) => {
      saveApiKey("test-deepseek");
      saveApiKey("test-bailian", "bailian");
      const before = new Map(values);
      const invalid = provider as AiProvider;
      expect(() => loadApiKey(invalid)).toThrow("提供商");
      expect(() => saveApiKey("replacement", invalid)).toThrow("提供商");
      expect(() => clearApiKey(invalid)).toThrow("提供商");
      expect(values).toEqual(before);
    },
  );

  it.each([
    "{broken",
    JSON.stringify({ version: 2, value: "test-bailian" }),
    JSON.stringify({ version: 1, value: 42 }),
  ])("isolates a corrupt Bailian credential from DeepSeek: %s", (raw) => {
    saveApiKey("test-deepseek");
    values.set(BAILIAN_KEY, raw);
    expect(() => loadApiKey("bailian")).toThrow();
    expect(loadApiKey()).toBe("test-deepseek");
    expect(values.get(BAILIAN_KEY)).toBe(raw);
  });
});

describe("AI model settings", () => {
  it("returns independent defaults and does not write while loading", () => {
    const first = loadAiSettings();
    first.provider = "bailian";
    first.models.deepseek = "changed-model";
    expect(loadAiSettings()).toEqual(defaultAiSettings());
    expect(values.size).toBe(0);
  });

  it("round trips independent model choices and the selected provider", () => {
    const settings: AiSettings = {
      provider: "bailian",
      models: { deepseek: "deepseek-v4-flash", bailian: "qwen3.7-flash" },
    };
    saveAiSettings(settings);
    expect(loadAiSettings()).toEqual(settings);
    expect(JSON.parse(values.get(SETTINGS_KEY)!)).toEqual({ version: 1, value: settings });
    saveAiSettings({ ...settings, provider: "deepseek" });
    expect(loadAiSettings()).toEqual({ ...settings, provider: "deepseek" });
  });

  it.each([
    "{broken",
    JSON.stringify({ version: 2, value: defaultAiSettings() }),
    JSON.stringify({ version: 1, value: null }),
    JSON.stringify({ version: 1, value: [] }),
    JSON.stringify({ value: defaultAiSettings() }),
  ])("uses defaults for an invalid envelope without rewriting: %s", (raw) => {
    values.set(SETTINGS_KEY, raw);
    expect(loadAiSettings()).toEqual(defaultAiSettings());
    expect(values.get(SETTINGS_KEY)).toBe(raw);
  });

  it("repairs invalid fields independently and preserves other valid choices", () => {
    const raw = JSON.stringify({ version: 1, value: {
      provider: "unknown",
      models: { deepseek: "deepseek-custom", bailian: "https://untrusted.invalid" },
    } });
    values.set(SETTINGS_KEY, raw);
    expect(loadAiSettings()).toEqual({
      ...defaultAiSettings(),
      models: { ...defaultAiSettings().models, deepseek: "deepseek-custom" },
    });
    expect(values.get(SETTINGS_KEY)).toBe(raw);
    values.set(SETTINGS_KEY, JSON.stringify({ version: 1, value: {
      provider: "bailian", models: { deepseek: "", bailian: "qwen3.7-flash" },
    } }));
    expect(loadAiSettings()).toEqual({
      provider: "bailian",
      models: { ...defaultAiSettings().models, bailian: "qwen3.7-flash" },
    });
  });

  it.each([undefined, null, [], "invalid"])('repairs a missing or invalid models object: %s', (models) => {
    values.set(SETTINGS_KEY, JSON.stringify({ version: 1, value: { provider: "bailian", models } }));
    expect(loadAiSettings()).toEqual({ ...defaultAiSettings(), provider: "bailian" });
  });

  it("writes and reads only the provider and model whitelist", () => {
    const settings = defaultAiSettings();
    const extended = {
      ...settings,
      key: "test-only-extra-credential",
      endpoint: "https://untrusted.invalid",
      models: { ...settings.models, endpoint: "https://untrusted.invalid", key: "test-only-nested-credential" },
    };
    saveAiSettings(extended);
    expect(JSON.parse(values.get(SETTINGS_KEY)!)).toEqual({ version: 1, value: settings });
    const raw = JSON.stringify({ version: 1, value: extended });
    values.set(SETTINGS_KEY, raw);
    expect(loadAiSettings()).toEqual(settings);
    expect(values.get(SETTINGS_KEY)).toBe(raw);
  });

  it.each([
    null,
    { ...defaultAiSettings(), provider: "unknown" },
    { ...defaultAiSettings(), models: null },
    { ...defaultAiSettings(), models: { deepseek: "valid-model" } },
    { ...defaultAiSettings(), models: { ...defaultAiSettings().models, deepseek: "" } },
    { ...defaultAiSettings(), models: { ...defaultAiSettings().models, bailian: 42 } },
    { ...defaultAiSettings(), models: { ...defaultAiSettings().models, bailian: "sk-test-only-credential" } },
    { ...defaultAiSettings(), models: { ...defaultAiSettings().models, bailian: "https://untrusted.invalid" } },
  ])("rejects invalid settings without overwriting the saved value: %s", (value) => {
    saveAiSettings(defaultAiSettings());
    const before = values.get(SETTINGS_KEY);
    expect(() => saveAiSettings(value as AiSettings)).toThrow("模型设置格式无效");
    expect(values.get(SETTINGS_KEY)).toBe(before);
  });
});

describe("AI storage permission errors", () => {
  it("propagates read, write and removal failures for both providers and settings", () => {
    const deny = () => { throw new DOMException("Denied", "SecurityError"); };
    vi.stubGlobal("localStorage", { getItem: deny, setItem: deny, removeItem: deny });
    for (const provider of ["deepseek", "bailian"] as const) {
      expect(() => loadApiKey(provider)).toThrow("Denied");
      expect(() => saveApiKey("test-only-credential", provider)).toThrow("Denied");
      expect(() => clearApiKey(provider)).toThrow("Denied");
    }
    expect(() => loadAiSettings()).toThrow("Denied");
    expect(() => saveAiSettings(defaultAiSettings())).toThrow("Denied");
  });

  it("reports unavailable browser storage", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(() => loadAiSettings()).toThrow("不支持");
    expect(() => saveAiSettings(defaultAiSettings())).toThrow("不支持");
    expect(() => loadApiKey("bailian")).toThrow("不支持");
    expect(() => saveApiKey("test-only-credential", "bailian")).toThrow("不支持");
    expect(() => clearApiKey("bailian")).toThrow("不支持");
  });
});
