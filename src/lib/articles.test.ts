import { describe, expect, it } from "vitest";
import {
  SAMPLE_ARTICLES,
  sentenceReading,
  sentenceText,
  validateArticleContent,
} from "./articles";

const valid = () => ({
  title: "練習",
  sentences: [
    {
      translation: "我看书。",
      segments: [
        { text: "私は本を読みます。", reading: "わたしはほんをよみます。" },
      ],
    },
  ],
});

describe("article content validation", () => {
  it("validates all three original samples with unique IDs and complete sentences", () => {
    expect(SAMPLE_ARTICLES).toHaveLength(3);
    expect(new Set(SAMPLE_ARTICLES.map((article) => article.id)).size).toBe(3);
    for (const article of SAMPLE_ARTICLES) {
      expect(validateArticleContent(article)).toEqual({
        title: article.title,
        sentences: article.sentences,
      });
      expect(article.sentences.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("joins readings without inserting spaces at fragment boundaries", () => {
    const sentence = {
      translation: "大家",
      segments: [
        { text: "みん", reading: "みん" },
        { text: "な", reading: "な" },
      ],
    };
    expect(sentenceReading(sentence)).toBe("みんな");
    expect(sentenceText(sentence)).toBe("みんな");
  });

  it("allows independent punctuation with empty reading and normalizes Unicode", () => {
    const value = valid();
    value.sentences[0].segments = [
      { text: "が", reading: "か\u3099" },
      { text: "。", reading: "" },
    ];
    expect(validateArticleContent(value).sentences[0].segments).toEqual([
      { text: "が", reading: "が" },
      { text: "。", reading: "" },
    ]);
  });

  it.each([
    null,
    [],
    {},
    { title: "", sentences: [] },
    { ...valid(), sentences: [] },
    { ...valid(), title: "x".repeat(121) },
  ])("rejects malformed article %j", (value) => {
    expect(() => validateArticleContent(value)).toThrow();
  });

  it.each(["", "漢字", "hello", "123", "<script>", "😀", "。"])(
    "rejects a non-typable reading %j",
    (reading) => {
      const value = valid();
      value.sentences[0].segments[0].reading = reading;
      expect(() => validateArticleContent(value)).toThrow();
    },
  );

  it("rejects sentences consisting only of punctuation", () => {
    const value = valid();
    value.sentences[0].segments = [{ text: "。", reading: "" }];
    expect(() => validateArticleContent(value)).toThrow();
  });

  it("rejects missing translations and excessive segment counts", () => {
    const value = valid();
    value.sentences[0].translation = " ";
    expect(() => validateArticleContent(value)).toThrow();
    value.sentences[0].translation = "翻译";
    value.sentences[0].segments = Array.from({ length: 81 }, () => ({
      text: "あ",
      reading: "あ",
    }));
    expect(() => validateArticleContent(value)).toThrow();
  });

  it("rejects an oversized article", () => {
    const value = valid();
    value.sentences = Array.from({ length: 6 }, () => ({
      translation: "翻译",
      segments: [{ text: "あ".repeat(1000), reading: "あ" }],
    }));
    expect(() => validateArticleContent(value)).toThrow("5000");
  });
});
