import { describe, expect, it } from "vitest";
import { isLocale, localizedPath, preferredLocale } from "./locales";
import { kanaTitleKey } from "./history";

describe("locale navigation", () => {
  it("honors a saved supported language before browser preferences", () => {
    expect(preferredLocale("ja", ["en-US", "zh-CN"])).toBe("ja");
    expect(preferredLocale("bad", ["fr-FR", "en-GB"])).toBe("en");
    expect(preferredLocale(null, ["zh-TW"])).toBe("zh-CN");
    expect(preferredLocale(null, ["ja-JP"])).toBe("ja");
    expect(preferredLocale(null, ["fr"])).toBe("zh-CN");
    expect(isLocale("en-US")).toBe(false);
  });
  it("replaces only the locale segment and preserves query and fragment verbatim", () => {
    expect(localizedPath("ja", "/en/articles/?id=x%2Fy&mode=full#reading")).toBe("/ja/articles/?id=x%2Fy&mode=full#reading");
    expect(localizedPath("en", "/zh-CN/")).toBe("/en/");
    expect(localizedPath("en", "/settings#sound-settings-title")).toBe("/en/settings/#sound-settings-title");
    expect(localizedPath("ja", "/english/")).toBe("/ja/english/");
    expect(localizedPath("en", "/articles/?id=zh-CN")).toBe("/en/articles/?id=zh-CN");
  });
});

describe("existing history compatibility", () => {
  it("localizes known system kana titles without rewriting stored content", () => {
    expect(kanaTitleKey({ mode: "kana", title: "五十音 · 自由练习" })).toBe("normal");
    expect(kanaTitleKey({ mode: "kana", title: "五十音 · 错项强化" })).toBe("weak");
    expect(kanaTitleKey({ mode: "kana", title: "Kana practice", kanaPracticeMode: "weak" })).toBe("weak");
  });
  it("never interprets article or unknown user titles as system messages", () => {
    expect(kanaTitleKey({ mode: "article", title: "五十音 · 自由练习" })).toBeNull();
    expect(kanaTitleKey({ mode: "kana", title: "custom" })).toBeNull();
  });
});
