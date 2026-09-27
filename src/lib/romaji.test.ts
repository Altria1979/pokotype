import { describe, expect, it } from "vitest";
import { canTypeReading, normalizeReading, RomajiMatcher } from "./romaji";

function enter(reading: string, input: string) {
  const matcher = new RomajiMatcher(reading);
  for (const key of input)
    expect(matcher.input(key), `${reading} / ${input} at ${key}`).toBe(true);
  expect(matcher.done).toBe(true);
  expect(matcher.remaining).toBe("");
  expect(matcher.progress).toBe(1);
  return matcher;
}

describe("RomajiMatcher", () => {
  it.each([
    ["しちつ", "shichitsu"],
    ["しちつ", "sititu"],
    ["きゃしゅちょ", "kyashucho"],
    ["きゃしゅちょ", "kixyashilyutilyo"],
    ["しゃ", "sya"],
    ["にゃ", "nixya"],
    ["じゃ", "zya"],
    ["がっこう", "gakkou"],
    ["がっこう", "gaxtukou"],
    ["がっこう", "galtsukou"],
    ["っち", "cchi"],
    ["っち", "tti"],
    ["っち", "tchi"],
    ["っちゃ", "tcha"],
    ["んか", "nka"],
    ["んか", "nnka"],
    ["んか", "n'ka"],
    ["んな", "nna"],
    ["んな", "nnna"],
    ["んな", "n'na"],
    ["んあ", "nna"],
    ["んあ", "n'a"],
    ["んや", "nnya"],
    ["んや", "n'ya"],
    ["ん", "n"],
    ["ん", "nn"],
    ["ん", "n'"],
    ["んん", "nn"],
    ["んんあ", "nnna"],
    ["コーヒー", "ko-hi-"],
    ["わたしは、ねこを。", "watasihanekowo"],
    ["ティッシュ", "thisshu"],
    ["ヴァイオリン", "vaiorin"],
  ])("accepts %s as %s", (reading, spelling) => {
    enter(reading, spelling);
  });

  it("rejects ambiguous single n before vowels and y", () => {
    for (const reading of ["んあ", "んや"]) {
      const matcher = new RomajiMatcher(reading);
      expect(matcher.input("n")).toBe(true);
      expect(matcher.input(reading === "んあ" ? "a" : "y")).toBe(false);
      expect(matcher.done).toBe(false);
    }
  });
  it("keeps every state unchanged after a typo and changes hints with the chosen path", () => {
    const matcher = new RomajiMatcher("し");
    expect(matcher.nextKeys).toContain("s");
    expect(matcher.input("s")).toBe(true);
    expect(matcher.nextKeys).toEqual(expect.arrayContaining(["h", "i"]));
    const before = [matcher.typed, matcher.remaining, matcher.progress];
    expect(matcher.input("x")).toBe(false);
    expect([matcher.typed, matcher.remaining, matcher.progress]).toEqual(
      before,
    );
    expect(matcher.input("h")).toBe(true);
    expect(matcher.remaining).toBe("i");
    expect(matcher.input("i")).toBe(true);
    expect(matcher.done).toBe(true);
    expect(matcher.input("Escape")).toBe(false);
  });
  it("joins readings across segment boundaries without committing n too soon", () => {
    enter(["しん", "よう"].join(""), "shin'you");
    enter(["がっ", "こう"].join(""), "gakkou");
  });
  it("normalizes width and katakana and skips only punctuation/whitespace", () => {
    expect(normalizeReading(" ｶﾞ。コー！\n")).toBe("がこー");
    expect(canTypeReading("日本")).toBe(false);
    expect(canTypeReading("abc")).toBe(false);
    expect(canTypeReading("あ1")).toBe(false);
    expect(canTypeReading("。 ")).toBe(false);
    expect(canTypeReading("こんにちは。")).toBe(true);
    expect(() => new RomajiMatcher("あ漢")).toThrow();
  });
  it("handles a long sentence without enumerating spelling combinations", () => {
    const matcher = new RomajiMatcher("しちつきゃんか".repeat(100));
    expect(matcher.remaining.length).toBeGreaterThan(1000);
    for (const key of "sititukyanka".repeat(100))
      expect(matcher.input(key)).toBe(true);
    expect(matcher.done).toBe(true);
  });
});

function expectProjection(matcher: RomajiMatcher, readings: readonly string[]) {
  const groups = matcher.getDisplayGroups(readings);
  expect(groups.map((group) => group.typed).join("")).toBe(matcher.typed);
  expect(groups.map((group) => group.remaining).join("")).toBe(
    matcher.remaining,
  );
  let nextSegment = 0;
  for (const group of groups) {
    expect(group.startSegment).toBe(nextSegment);
    expect(group.endSegment).toBeGreaterThan(group.startSegment);
    nextSegment = group.endSegment;
  }
  expect(nextSegment).toBe(readings.length);
  return groups;
}

describe("article spelling projection", () => {
  it.each(["shi", "si"])("keeps %s in the same word", (spelling) => {
    const readings = ["わたし", "は"];
    const matcher = new RomajiMatcher(readings.join(""));
    for (const key of "wata" + spelling) {
      expect(matcher.input(key)).toBe(true);
      expectProjection(matcher, readings);
    }
    expect(expectProjection(matcher, readings)).toEqual([
      {
        startSegment: 0,
        endSegment: 1,
        typed: "wata" + spelling,
        remaining: "",
      },
      { startSegment: 1, endSegment: 2, typed: "", remaining: "ha" },
    ]);
  });

  it("keeps a doubled consonant with its small tsu across word boundaries", () => {
    const readings = ["がっ", "こう"];
    const matcher = new RomajiMatcher(readings.join(""));
    for (const key of "gak") matcher.input(key);
    expect(expectProjection(matcher, readings)).toEqual([
      { startSegment: 0, endSegment: 1, typed: "gak", remaining: "" },
      { startSegment: 1, endSegment: 2, typed: "", remaining: "kou" },
    ]);
    for (const key of "kou") {
      matcher.input(key);
      expectProjection(matcher, readings);
    }
    expect(matcher.done).toBe(true);
  });

  it.each([
    ["あ", "nna", "nn", "a"],
    ["あ", "n'a", "n'", "a"],
    ["や", "nnya", "nn", "ya"],
    ["や", "n'ya", "n'", "ya"],
    ["か", "nka", "n", "ka"],
    ["か", "nnka", "nn", "ka"],
    ["か", "n'ka", "n'", "ka"],
    ["な", "nna", "n", "na"],
    ["な", "nnna", "nn", "na"],
  ])(
    "resolves n before %s using %s",
    (next, spelling, firstTyped, nextTyped) => {
      const readings = ["ん", next];
      const matcher = new RomajiMatcher(readings.join(""));
      for (const key of spelling) {
        expect(matcher.input(key)).toBe(true);
        expectProjection(matcher, readings);
      }
      expect(expectProjection(matcher, readings)).toEqual([
        { startSegment: 0, endSegment: 1, typed: firstTyped, remaining: "" },
        { startSegment: 1, endSegment: 2, typed: nextTyped, remaining: "" },
      ]);
    },
  );

  it("reattributes an ambiguous n when nna changes into nnna", () => {
    const readings = ["ん", "な"];
    const matcher = new RomajiMatcher("んな");
    matcher.input("n");
    matcher.input("n");
    expect(expectProjection(matcher, readings)).toEqual([
      { startSegment: 0, endSegment: 1, typed: "n", remaining: "" },
      { startSegment: 1, endSegment: 2, typed: "n", remaining: "a" },
    ]);
    matcher.input("n");
    expect(expectProjection(matcher, readings)).toEqual([
      { startSegment: 0, endSegment: 1, typed: "nn", remaining: "" },
      { startSegment: 1, endSegment: 2, typed: "n", remaining: "a" },
    ]);
    matcher.input("a");
    expectProjection(matcher, readings);
    expect(matcher.done).toBe(true);
  });

  it("merges a contracted spelling across fragments then splits for separate input", () => {
    const readings = ["き", "ゃ", "く"];
    const matcher = new RomajiMatcher("きゃく");
    expect(expectProjection(matcher, readings)).toEqual([
      { startSegment: 0, endSegment: 2, typed: "", remaining: "kya" },
      { startSegment: 2, endSegment: 3, typed: "", remaining: "ku" },
    ]);
    matcher.input("k");
    expect(expectProjection(matcher, readings)[0]).toEqual({
      startSegment: 0,
      endSegment: 2,
      typed: "k",
      remaining: "ya",
    });
    matcher.input("i");
    expect(expectProjection(matcher, readings)).toEqual([
      { startSegment: 0, endSegment: 1, typed: "ki", remaining: "" },
      { startSegment: 1, endSegment: 2, typed: "", remaining: "xya" },
      { startSegment: 2, endSegment: 3, typed: "", remaining: "ku" },
    ]);
    for (const key of "lyaku") {
      expect(matcher.input(key)).toBe(true);
      expectProjection(matcher, readings);
    }
    expect(matcher.done).toBe(true);
  });

  it("leaves punctuation and empty fragments keyless and retains long marks", () => {
    const readings = ["", "コー", "、 ", "ヒー", "。", ""];
    const matcher = new RomajiMatcher(readings.join(""));
    for (const key of "ko-") matcher.input(key);
    expect(expectProjection(matcher, readings)).toEqual([
      { startSegment: 0, endSegment: 1, typed: "", remaining: "" },
      { startSegment: 1, endSegment: 2, typed: "ko-", remaining: "" },
      { startSegment: 2, endSegment: 3, typed: "", remaining: "" },
      { startSegment: 3, endSegment: 4, typed: "", remaining: "hi-" },
      { startSegment: 4, endSegment: 5, typed: "", remaining: "" },
      { startSegment: 5, endSegment: 6, typed: "", remaining: "" },
    ]);
    for (const key of "hi-") matcher.input(key);
    expectProjection(matcher, readings);
    expect(matcher.done).toBe(true);
  });

  it("projects empty sentences and merges only punctuation inside a chosen spelling", () => {
    expect(expectProjection(new RomajiMatcher("。"), ["", "。"]).length).toBe(
      2,
    );
    expect(expectProjection(new RomajiMatcher(""), [])).toEqual([]);
    expect(
      expectProjection(new RomajiMatcher("き、ゃ"), ["き", "、", "ゃ"]),
    ).toEqual([
      { startSegment: 0, endSegment: 3, typed: "", remaining: "kya" },
    ]);
  });

  it("keeps a cached projection on errors and refreshes it on accepted keys", () => {
    const readings = ["し", "は"];
    const matcher = new RomajiMatcher("しは");
    matcher.input("s");
    const before = expectProjection(matcher, readings);
    expect(matcher.getDisplayGroups([...readings])).toBe(before);
    expect(matcher.input("z")).toBe(false);
    expect(matcher.getDisplayGroups(readings)).toBe(before);
    expect(matcher.input("h")).toBe(true);
    expect(expectProjection(matcher, readings)[0].remaining).toBe("i");
    expect(matcher.getDisplayGroups(readings)).not.toBe(before);
    for (const key of "iha") matcher.input(key);
    expectProjection(matcher, readings);
    expect(matcher.done).toBe(true);
  });

  it("rejects segment readings unrelated to this sentence", () => {
    const matcher = new RomajiMatcher("わたしは");
    expect(() => matcher.getDisplayGroups(["わたし", "が"])).toThrow(
      "分段读音必须与当前练习的完整读音一致",
    );
  });
});
