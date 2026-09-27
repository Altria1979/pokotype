import { describe, expect, it } from "vitest";
import { RomajiMatcher } from "./romaji";

describe("输入规则说明与练习判定一致", () => {
  it.each([
    ["は", "ha"],
    ["へ", "he"],
    ["を", "wo"],
    ["わたしは", "watashiha"],
    ["し", "shi"],
    ["し", "si"],
    ["ち", "chi"],
    ["ち", "ti"],
    ["つ", "tsu"],
    ["つ", "tu"],
    ["じ", "ji"],
    ["じ", "zi"],
    ["きって", "kitte"],
    ["ざっし", "zasshi"],
    ["っ", "xtu"],
    ["っ", "ltu"],
    ["っ", "xtsu"],
    ["っ", "ltsu"],
    ["ゃ", "xya"],
    ["ゃ", "lya"],
    ["さんま", "sanma"],
    ["しんよう", "shin'you"],
    ["しんよう", "shinnyou"],
    ["みんな", "minna"],
    ["しゃ", "sha"],
    ["しゃ", "sya"],
    ["ちゅ", "chu"],
    ["にゃ", "nya"],
    ["が", "ga"],
    ["ぴょ", "pyo"],
    ["コーヒー、 です。", "ko-hi-desu"],
  ])("说明示例 %s → %s 可直接完成", (reading, spelling) => {
    const matcher = new RomajiMatcher(reading);
    for (const key of spelling) {
      expect(matcher.done, `在 ${key} 之前不应提前完成`).toBe(false);
      expect(matcher.input(key), `${reading} / ${spelling}`).toBe(true);
    }
    expect(matcher.done).toBe(true);
  });

  it.each(["ん", "ほん"])("%s 在末尾第一个 n 后立即完成", (reading) => {
    const matcher = new RomajiMatcher(reading);
    const spelling = reading === "ん" ? "n" : "hon";
    for (const key of spelling) expect(matcher.input(key)).toBe(true);
    expect(matcher.done).toBe(true);
    expect(matcher.remaining).toBe("");
  });

  it.each([
    ["は", "wa"],
    ["へ", "e"],
    ["を", "o"],
    ["しゃ", "shia"],
    ["んな", "n-na"],
  ])("不把 %s 的易混淆写法 %s 当作合法路径", (reading, spelling) => {
    const matcher = new RomajiMatcher(reading);
    expect([...spelling].every((key) => matcher.input(key))).toBe(false);
    expect(matcher.done).toBe(false);
  });
});
