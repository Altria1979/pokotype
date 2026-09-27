export type KanaStat = { seen: number; errors: number; durationMs: number };
export type KanaGroup = {
  id: string;
  label: string;
  category: "清音" | "浊音" | "半浊音" | "拗音";
  kana: string[];
};

const rows: [string, string, KanaGroup["category"], string][] = [
  ["a", "あ行", "清音", "あ い う え お"],
  ["ka", "か行", "清音", "か き く け こ"],
  ["sa", "さ行", "清音", "さ し す せ そ"],
  ["ta", "た行", "清音", "た ち つ て と"],
  ["na", "な行", "清音", "な に ぬ ね の"],
  ["ha", "は行", "清音", "は ひ ふ へ ほ"],
  ["ma", "ま行", "清音", "ま み む め も"],
  ["ya", "や行", "清音", "や ゆ よ"],
  ["ra", "ら行", "清音", "ら り る れ ろ"],
  ["wa", "わ行・ん", "清音", "わ を ん"],
  ["ga", "が行", "浊音", "が ぎ ぐ げ ご"],
  ["za", "ざ行", "浊音", "ざ じ ず ぜ ぞ"],
  ["da", "だ行", "浊音", "だ ぢ づ で ど"],
  ["ba", "ば行", "浊音", "ば び ぶ べ ぼ"],
  ["pa", "ぱ行", "半浊音", "ぱ ぴ ぷ ぺ ぽ"],
];
for (const base of [
  "き",
  "し",
  "ち",
  "に",
  "ひ",
  "み",
  "り",
  "ぎ",
  "じ",
  "ぢ",
  "び",
  "ぴ",
]) {
  rows.push([
    `contracted-${base}`,
    `${base}ゃ行`,
    "拗音",
    `${base}ゃ ${base}ゅ ${base}ょ`,
  ]);
}
export const KANA_GROUPS: KanaGroup[] = rows.map(
  ([id, label, category, kana]) => ({
    id,
    label,
    category,
    kana: kana.split(" "),
  }),
);

export function toKatakana(value: string): string {
  return [...value]
    .map((char) => {
      const code = char.charCodeAt(0);
      return code >= 0x3041 && code <= 0x3096
        ? String.fromCharCode(code + 0x60)
        : char;
    })
    .join("");
}

/** Weak review samples practiced entries, weighted by errors per presentation. */
export function makeKanaQueue(
  pool: string[],
  count: number,
  weakStats?: Record<string, KanaStat>,
): string[] {
  const unique = [...new Set(pool)];
  const candidates = weakStats
    ? unique.filter((kana) => (weakStats[kana]?.seen ?? 0) > 0)
    : unique;
  if (!candidates.length || !Number.isFinite(count) || count < 1) return [];
  const result: string[] = [];
  for (let i = 0; i < Math.floor(count); i++) {
    const allowed =
      candidates.length === 1
        ? candidates
        : candidates.filter((kana) => kana !== result.at(-1));
    const weights = allowed.map((kana) => {
      const stat = weakStats?.[kana];
      return stat ? 1 + (5 * stat.errors) / Math.max(1, stat.seen) : 1;
    });
    let target =
      Math.random() * weights.reduce((sum, weight) => sum + weight, 0);
    const index = weights.findIndex((weight) => {
      target -= weight;
      return target < 0;
    });
    result.push(allowed[index < 0 ? allowed.length - 1 : index]);
  }
  return result;
}
