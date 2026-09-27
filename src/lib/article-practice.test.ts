import { describe, expect, it } from "vitest";
import { getArticleWindow, type ArticleGroupSize } from "./article-practice";

describe("article sentence windows", () => {
  it.each([3, 5, 10] as const)("keeps groups of %i consecutive sentences without dropping the remainder", (size) => {
    for (const total of [1, size - 1, size, size + 1, 80]) {
      const visited: number[] = [];
      for (let index = 0; index < total;) {
        const window = getArticleWindow(total, index, "group", size);
        expect(window).toEqual({ start: index, end: Math.min(index + size, total) });
        for (let current = window.start; current < window.end; current++) {
          expect(getArticleWindow(total, current, "group", size)).toEqual(window);
          visited.push(current);
        }
        index = window.end;
      }
      expect(visited).toEqual(Array.from({ length: total }, (_, index) => index));
    }
  });

  it.each(["sentence", "group", "full"] as const)("has an empty window for an empty %s article", (mode) => {
    expect(getArticleWindow(0, 0, mode, 3)).toEqual({ start: 0, end: 0 });
  });

  it("retains the entire article in full mode and only the current sentence in sentence mode", () => {
    for (let index = 0; index < 80; index++) {
      for (const size of [3, 5, 10] as ArticleGroupSize[]) {
        expect(getArticleWindow(80, index, "full", size)).toEqual({ start: 0, end: 80 });
        expect(getArticleWindow(80, index, "sentence", size)).toEqual({ start: index, end: index + 1 });
      }
    }
  });

  it("keeps the first or last window for an out-of-range cursor", () => {
    expect(getArticleWindow(4, -1, "group", 3)).toEqual({ start: 0, end: 3 });
    expect(getArticleWindow(4, 4, "group", 3)).toEqual({ start: 3, end: 4 });
  });
});
