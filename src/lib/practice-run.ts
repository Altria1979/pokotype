import type { Sentence } from "./articles";
import type { ArticlePracticeMode } from "./article-practice";
import { RomajiMatcher } from "./romaji";
import { ActiveTimer } from "./session";
import type { KanaStats } from "./storage";

export type PracticeItem = {
  reading: string;
  text: string;
  sentence?: Sentence;
  statKey?: string;
};

/** Input, listening and timing share one imperative session, independent of renders. */
export class PracticeRun {
  index = 0;
  correct = 0;
  errors = 0;
  paused = false;
  complete = false;
  listening = false;
  awaitingInput = false;
  itemErrors = 0;
  itemStarted = 0;
  lastError = false;
  completedGroupText: string | undefined;
  private completedSegments = 0;
  timer = new ActiveTimer();
  deltas: KanaStats = {};
  weak = new Set<string>();
  matcher: RomajiMatcher;

  constructor(
    readonly items: PracticeItem[],
    readonly mode: "kana" | "article",
    readonly articlePracticeMode: ArticlePracticeMode = "sentence",
  ) {
    this.matcher = new RomajiMatcher(items[0].reading);
  }

  input(key: string): "ignored" | "wrong" | "progress" | "completed" {
    this.completedGroupText = undefined;
    if (this.paused || this.complete || this.listening || this.matcher.done)
      return "ignored";
    const accepted = this.matcher.input(key);
    this.lastError = !accepted;
    if (!accepted) {
      this.errors++;
      this.itemErrors++;
      this.weak.add(this.items[this.index].statKey ?? this.items[this.index].text);
      return "wrong";
    }
    this.timer.start();
    this.timer.resume();
    this.awaitingInput = false;
    this.correct++;
    const sentence = this.items[this.index].sentence;
    if (this.mode === "article" && sentence) {
      const groups = this.matcher.getDisplayGroups(sentence.segments.map((segment) => segment.reading));
      const completed = groups.filter((group) => group.typed && !group.remaining).at(-1);
      if (completed && completed.endSegment > this.completedSegments) {
        this.completedGroupText = sentence.segments
          .slice(Math.max(completed.startSegment, this.completedSegments), completed.endSegment)
          .map((segment) => segment.text).join("");
        this.completedSegments = completed.endSegment;
      }
    }
    if (!this.matcher.done) return "progress";

    const item = this.items[this.index];
    if (item.statKey) {
      const old = this.deltas[item.statKey] ?? { seen: 0, errors: 0, durationMs: 0 };
      this.deltas[item.statKey] = {
        seen: old.seen + 1,
        errors: old.errors + this.itemErrors,
        durationMs: old.durationMs + this.timer.elapsed() - this.itemStarted,
      };
    }
    if (this.mode === "article" && (
      this.articlePracticeMode === "sentence" || this.index === this.items.length - 1
    )) this.timer.pause();
    return "completed";
  }

  /** Natural speech end and skip may race; only the completed item can advance. */
  advance(expectedIndex: number): boolean {
    if (this.complete || this.index !== expectedIndex || !this.matcher.done)
      return false;
    this.listening = false;
    this.index++;
    this.itemStarted = this.timer.elapsed();
    this.itemErrors = 0;
    this.lastError = false;
    this.completedSegments = 0;
    this.completedGroupText = undefined;
    if (this.index === this.items.length) {
      this.complete = true;
      this.timer.pause();
    } else {
      this.matcher = new RomajiMatcher(this.items[this.index].reading);
      this.awaitingInput = this.mode === "article" && this.articlePracticeMode === "sentence";
      if (!this.paused && !this.awaitingInput) this.timer.resume();
    }
    return true;
  }

  beginListening() {
    if (this.mode === "article" && this.matcher.done && !this.complete) {
      this.listening = true;
      this.timer.pause();
    }
  }

  pause() {
    this.paused = true;
    this.timer.pause();
  }

  resume() {
    this.paused = false;
    if (!this.complete && !this.listening && !this.awaitingInput) this.timer.resume();
  }
}
