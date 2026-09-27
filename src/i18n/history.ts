import type { PracticeRecord } from "../lib/storage";

/** Old stored titles are recognized only for system-owned kana records. */
export function kanaTitleKey(record: Pick<PracticeRecord, "mode" | "title" | "kanaPracticeMode">): "normal" | "weak" | null {
  if (record.mode !== "kana") return null;
  if (record.kanaPracticeMode) return record.kanaPracticeMode;
  if (record.title === "五十音 · 自由练习") return "normal";
  if (record.title === "五十音 · 错项强化") return "weak";
  return null;
}
