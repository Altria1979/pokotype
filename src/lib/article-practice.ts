export type ArticlePracticeMode = "sentence" | "group" | "full";
export type ArticleGroupSize = 3 | 5 | 10;

export const ARTICLE_PRACTICE_LABELS: Record<ArticlePracticeMode, string> = {
  sentence: "逐句练习",
  group: "分组练习",
  full: "整篇练习",
};

/** The visible sentence range; end is exclusive. */
export function getArticleWindow(
  total: number,
  index: number,
  mode: ArticlePracticeMode,
  size: ArticleGroupSize,
): { start: number; end: number } {
  if (total === 0) return { start: 0, end: 0 };
  if (mode === "full") return { start: 0, end: total };
  const current = Math.max(0, Math.min(index, total - 1));
  const count = mode === "sentence" ? 1 : size;
  const start = Math.floor(current / count) * count;
  return { start, end: Math.min(start + count, total) };
}
