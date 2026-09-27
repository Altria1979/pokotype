import { afterEach, describe, expect, it, vi } from "vitest";
import { createTranslator } from "next-intl";
import { AppError } from "../i18n/errors";
import enArticleErrors from "../i18n/messages/en/ArticleErrors.json";
import jaArticleErrors from "../i18n/messages/ja/ArticleErrors.json";
import zhArticleErrors from "../i18n/messages/zh-CN/ArticleErrors.json";
import enGenerationErrors from "../i18n/messages/en/GenerationErrors.json";
import jaGenerationErrors from "../i18n/messages/ja/GenerationErrors.json";
import zhGenerationErrors from "../i18n/messages/zh-CN/GenerationErrors.json";
import { validateArticleContent } from "./articles";
import { generateArticle } from "./deepseek";

afterEach(() => vi.unstubAllGlobals());

describe("localized article errors", () => {
  const invalidReading = {
    title: "朝",
    sentences: [{ translation: "早晨", segments: [{ text: "朝", reading: "朝" }] }],
  };

  it("keeps a stable code and sentence number independent of diagnostic text", () => {
    expect(() => validateArticleContent(invalidReading)).toThrow(AppError);
    try {
      validateArticleContent(invalidReading);
    } catch (error) {
      expect(error).toMatchObject({
        code: "ArticleErrors.reading",
        values: { sentence: 1 },
      });
    }
  });

  it("preserves structured article errors through generation validation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify(invalidReading) } }],
    }))));
    await expect(generateArticle({ topic: "日常", level: "N5", length: "short" }, "test-key"))
      .rejects.toMatchObject({ code: "ArticleErrors.reading", values: { sentence: 1 } });
  });

  it.each([
    ["zh-CN", zhArticleErrors, zhGenerationErrors, "第 2 句", "阿里百炼"],
    ["en", enArticleErrors, enGenerationErrors, "Sentence 2", "Alibaba Cloud Model Studio"],
    ["ja", jaArticleErrors, jaGenerationErrors, "第2文", "Alibaba Cloud Model Studio"],
  ] as const)("translates structured errors and provider names in %s", (locale, ArticleErrors, GenerationErrors, sentence, provider) => {
    const t = createTranslator({ locale, messages: { ArticleErrors, GenerationErrors } });
    expect(t("ArticleErrors.reading", { sentence: 2 })).toContain(sentence);
    expect(t("GenerationErrors.invalidKey.bailian")).toContain(provider);
    expect(t("GenerationErrors.http", { status: 418 })).toContain("418");
  });
});
