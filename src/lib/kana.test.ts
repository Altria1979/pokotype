import { afterEach, describe, expect, it, vi } from "vitest";
import { KANA_GROUPS, makeKanaQueue, toKatakana } from "./kana";
import { canTypeReading } from "./romaji";

afterEach(() => vi.restoreAllMocks());
describe("kana selection", () => {
  it("contains all four categories and every entry is typeable", () => {
    expect(new Set(KANA_GROUPS.map((group) => group.category)).size).toBe(4);
    for (const group of KANA_GROUPS)
      for (const kana of group.kana) {
        expect(canTypeReading(kana)).toBe(true);
        expect(canTypeReading(toKatakana(kana))).toBe(true);
      }
    expect(toKatakana("きゃ、パー")).toBe("キャ、パー");
  });
  it("respects the pool and length and never repeats adjacent entries", () => {
    const queue = makeKanaQueue(["あ", "い", "う", "あ"], 100);
    expect(queue).toHaveLength(100);
    queue.forEach((kana, index) => {
      expect(["あ", "い", "う"]).toContain(kana);
      if (index) expect(kana).not.toBe(queue[index - 1]);
    });
    expect(makeKanaQueue([], 20)).toEqual([]);
    expect(makeKanaQueue(["あ"], 3)).toEqual(["あ", "あ", "あ"]);
  });
  it("reviews practiced entries only and gives weaker entries more weight", () => {
    const stats = {
      あ: { seen: 10, errors: 0, durationMs: 100 },
      い: { seen: 10, errors: 10, durationMs: 100 },
    };
    vi.spyOn(Math, "random").mockReturnValue(0.3);
    expect(makeKanaQueue(["あ", "い", "う"], 1, stats)).toEqual(["い"]);
    expect(makeKanaQueue(["う"], 20, stats)).toEqual([]);
  });
});
