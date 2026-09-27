import { afterEach, describe, expect, it, vi } from "vitest";
import { PracticeRun } from "./practice-run";
import { sentenceReading, sentenceText, type Segment } from "./articles";
import type { ArticlePracticeMode } from "./article-practice";

afterEach(() => vi.restoreAllMocks());

function articleRun(segments: Segment[]) {
  const sentence = { segments, translation: "测试" };
  const item = { sentence, reading: sentenceReading(sentence), text: sentenceText(sentence) };
  return new PracticeRun([item, item], "article", "sentence");
}

describe("completed article display groups", () => {
  it("reports each completed group once without blocking input or changing scoring", () => {
    const run = articleRun([{ text: "私は", reading: "わたしは" }, { text: "起きます。", reading: "おきます" }]);
    for (const key of "watashi") {
      run.input(key);
      expect(run.completedGroupText).toBeUndefined();
    }
    run.input("q");
    run.input("h");
    expect(run.completedGroupText).toBeUndefined();
    expect(run.input("a")).toBe("progress");
    expect(run.completedGroupText).toBe("私は");
    expect(run.listening).toBe(false);
    run.input("q");
    expect(run.completedGroupText).toBeUndefined();
    for (const key of "okimasu") run.input(key);
    expect(run.completedGroupText).toBe("起きます。");
    expect(run.correct).toBe(16);
    expect(run.errors).toBe(2);
    run.advance(0);
    expect(run.completedGroupText).toBeUndefined();
    for (const key of "watasiha") run.input(key);
    expect(run.completedGroupText).toBe("私は");
  });

  it.each([
    ["kyaku", ["きゃ", "く"]],
    ["kilyaku", ["き", "ゃ", "く"]],
  ])("follows the actual merged display groups for %s", (spelling, expected) => {
    const run = articleRun(["き", "ゃ", "く"].map((reading) => ({ reading, text: reading })));
    const spoken: string[] = [];
    for (const key of spelling) {
      run.input(key);
      if (run.completedGroupText) spoken.push(run.completedGroupText);
    }
    expect(spoken).toEqual(expected);
  });

  it("does not repeat an already completed group when ambiguous n is reattributed", () => {
    const run = articleRun([{ text: "ん", reading: "ん" }, { text: "な", reading: "な" }]);
    const spoken: string[] = [];
    for (const key of "nnna") {
      run.input(key);
      if (run.completedGroupText) spoken.push(run.completedGroupText);
    }
    expect(spoken).toEqual(["ん", "な"]);
  });
});

describe("practice listening transitions", () => {
  it("counts a completed kana only once and preserves errors and alternative spellings", () => {
    const run = new PracticeRun([{ reading: "し", text: "し", statKey: "し" }], "kana");
    expect(run.input("x")).toBe("wrong");
    for (const key of "sh") expect(run.input(key)).toBe("progress");
    expect(run.input("i")).toBe("completed");
    expect(run.input("i")).toBe("ignored");
    expect(run.deltas["し"]).toMatchObject({ seen: 1, errors: 1 });
    expect(run.advance(0)).toBe(true);
    expect(run.advance(0)).toBe(false);
    expect(run.complete).toBe(true);
    expect(run.correct).toBe(3);
    expect(run.errors).toBe(1);
  });

  it("excludes listening, pause and the wait for the next correct input from active time", () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const run = new PracticeRun([
      { reading: "か", text: "蚊" },
      { reading: "き", text: "木" },
    ], "article", "sentence");
    run.input("k");
    now = 1000;
    expect(run.input("a")).toBe("completed");
    run.listening = true;
    now = 8000;
    expect(run.input("q")).toBe("ignored");
    expect(run.errors).toBe(0);
    run.pause();
    now = 15000;
    run.resume();
    expect(run.timer.elapsed()).toBe(1000);
    run.advance(0);
    now = 20000;
    run.pause();
    run.resume();
    run.input("q");
    expect(run.timer.elapsed()).toBe(1000);
    now = 25000;
    run.input("k");
    now = 26000;
    run.input("i");
    expect(run.timer.elapsed()).toBe(2000);
    run.listening = true;
    now = 35000;
    run.advance(1);
    expect(run.timer.elapsed()).toBe(2000);
    expect(run.complete).toBe(true);
  });

  it("rejects a stale end callback even after the next sentence has also finished", () => {
    const run = new PracticeRun([{reading:"あ",text:"あ"},{reading:"い",text:"い"}], "article", "sentence");
    run.input("a");
    run.listening = true;
    expect(run.advance(0)).toBe(true);
    run.input("i");
    run.listening = true;
    expect(run.advance(0)).toBe(false);
    expect(run.complete).toBe(false);
    expect(run.index).toBe(1);
    expect(run.advance(1)).toBe(true);
  });

  it("retains paused state when a completed sentence is skipped while paused", () => {
    const run = new PracticeRun([{reading:"あ",text:"あ"},{reading:"い",text:"い"}], "article", "sentence");
    run.input("a");
    run.listening = true;
    run.pause();
    run.advance(0);
    expect(run.paused).toBe(true);
    expect(run.input("i")).toBe("ignored");
    run.resume();
    expect(run.input("i")).toBe("completed");
  });
});

describe.each(["group", "full"] as const)("continuous %s article practice", (mode) => {
  function createRun(articlePracticeMode: ArticlePracticeMode = mode) {
    return new PracticeRun([
      { reading: "か", text: "蚊" },
      { reading: "し", text: "詩" },
      { reading: "ん", text: "ん" },
      { reading: "あ", text: "あ" },
    ], "article", articlePracticeMode);
  }

  it("starts on the first correct input and counts time across every sentence until the final key", () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const run = createRun();
    run.input("x");
    now = 1000;
    expect(run.timer.elapsed()).toBe(0);
    run.input("k");
    now = 2000;
    expect(run.input("a")).toBe("completed");
    expect(run.advance(0)).toBe(true);
    expect(run.awaitingInput).toBe(false);
    now = 3000;
    run.input("x");
    expect(run.timer.elapsed()).toBe(2000);
    for (const key of "shi") run.input(key);
    run.advance(1);
    now = 4000;
    expect(run.input("n")).toBe("completed");
    run.advance(2);
    now = 5000;
    expect(run.input("a")).toBe("completed");
    now = 6000;
    expect(run.timer.elapsed()).toBe(4000);
    expect(run.advance(3)).toBe(true);
    run.pause();
    run.resume();
    now = 10000;
    expect(run.timer.elapsed()).toBe(4000);
    expect(run.complete).toBe(true);
    expect(run.correct).toBe(7);
    expect(run.errors).toBe(2);
  });

  it("excludes listening and pauses, resumes after natural end or skip, and rejects late callbacks", () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const run = createRun();
    run.input("k");
    now = 1000;
    run.input("a");
    run.beginListening();
    now = 5000;
    expect(run.input("s")).toBe("ignored");
    expect(run.timer.elapsed()).toBe(1000);
    expect(run.advance(0)).toBe(true);
    now = 6000;
    expect(run.timer.elapsed()).toBe(2000);
    for (const key of "si") run.input(key);
    run.beginListening();
    run.pause();
    now = 9000;
    expect(run.advance(0)).toBe(false);
    expect(run.listening).toBe(true);
    expect(run.advance(1)).toBe(true);
    expect(run.paused).toBe(true);
    expect(run.input("n")).toBe("ignored");
    now = 12000;
    expect(run.timer.elapsed()).toBe(2000);
    run.resume();
    now = 13000;
    expect(run.timer.elapsed()).toBe(3000);
    run.input("n");
    run.beginListening();
    run.pause();
    now = 18000;
    run.resume();
    expect(run.timer.elapsed()).toBe(3000);
    run.advance(2);
    now = 19000;
    expect(run.input("a")).toBe("completed");
    run.advance(3);
    expect(run.timer.elapsed()).toBe(4000);
  });

  it("accepts fast consecutive input, alternative spellings and sentence-final n exactly once", () => {
    const run = createRun();
    const input = ["ka", "shi", "n", "a"];
    input.forEach((spelling, index) => {
      for (const key of spelling) run.input(key);
      expect(run.matcher.done).toBe(true);
      expect(run.input("q")).toBe("ignored");
      expect(run.advance(index)).toBe(true);
      expect(run.advance(index)).toBe(false);
    });
    expect(run.index).toBe(4);
    expect(run.complete).toBe(true);
    expect(run.correct).toBe(7);
    expect(run.errors).toBe(0);
    expect(run.input("a")).toBe("ignored");
  });

  it("keeps a mid-sentence pause stopped until explicitly resumed", () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const run = createRun();
    run.input("k");
    now = 1000;
    run.pause();
    now = 5000;
    run.beginListening();
    expect(run.listening).toBe(false);
    expect(run.input("a")).toBe("ignored");
    expect(run.timer.elapsed()).toBe(1000);
    run.resume();
    now = 6000;
    run.input("a");
    expect(run.timer.elapsed()).toBe(2000);
  });
});
