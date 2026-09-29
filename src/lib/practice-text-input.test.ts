import { describe, expect, it } from "vitest";
import { PracticeRun } from "./practice-run";
import { PracticeTextInput } from "./practice-text-input";

describe("PracticeTextInput", () => {
  it("reads text snapshots without keydown or InputEvent.data", () => {
    const input = new PracticeTextInput();
    expect(input.read({ value: "s", inputType: "insertText" }).text).toBe("s");
    expect(input.read({ value: "shi", inputType: "insertText" }).text).toBe("hi");
    expect(input.read({ value: "shi" }).text).toBe("");
    expect(input.read({ value: "shika", inputType: "" }).text).toBe("ka");
  });

  it("normalizes uppercase and preserves apostrophes and hyphens", () => {
    const input = new PracticeTextInput();
    expect(input.read({ value: "N'KO-HI-" })).toEqual({ text: "n'ko-hi-", invalid: false });
    expect(input.read({ value: "N'KO-HI-SHI" }).text).toBe("shi");
  });

  it("consumes ASCII composition incrementally and never replays its final commit", () => {
    const input = new PracticeTextInput();
    expect(input.read({ value: "k", inputType: "insertCompositionText", isComposing: true }).text).toBe("k");
    expect(input.read({ value: "ky", inputType: "insertCompositionText", isComposing: true }).text).toBe("y");
    expect(input.read({ value: "kya", inputType: "insertCompositionText", isComposing: true }).text).toBe("a");
    // compositionend, followed by a browser's final input, sees the same field.
    expect(input.read({ value: "kya", isComposing: false }).text).toBe("");
    expect(input.read({ value: "kya", inputType: "insertText" }).text).toBe("");
    expect(input.read({ value: "kyak", inputType: "insertCompositionText", isComposing: true }).text).toBe("k");
  });

  it("accepts a final composition suffix if it was not emitted earlier", () => {
    const input = new PracticeTextInput();
    expect(input.read({ value: "sh", isComposing: true }).text).toBe("sh");
    expect(input.read({ value: "shi", inputType: "insertFromComposition" }).text).toBe("i");
    expect(input.read({ value: "shi", inputType: "insertFromComposition" }).text).toBe("");
  });

  it.each([
    "insertFromPaste", "insertFromPasteAsQuotation", "insertFromDrop",
    "insertReplacementText", "historyUndo", "historyRedo", "insertLineBreak",
  ])("ignores %s and prevents its text from being replayed", (inputType) => {
    const input = new PracticeTextInput();
    input.read({ value: "ka" });
    expect(input.read({ value: "kashi", inputType })).toEqual({ text: "", invalid: false });
    expect(input.read({ value: "kashi" }).text).toBe("");
    expect(input.read({ value: "kashina" }).text).toBe("na");
  });

  it("does not rewind on deletion and still recognizes a subsequently typed suffix", () => {
    const input = new PracticeTextInput();
    input.read({ value: "ka" });
    expect(input.read({ value: "k", inputType: "deleteContentBackward" }).text).toBe("");
    expect(input.read({ value: "ki" }).text).toBe("i");
    expect(input.read({ value: "", inputType: "deleteContentForward" }).text).toBe("");
    expect(input.read({ value: "NA" }).text).toBe("na");
  });

  it("rejects edits in the middle, selections and composition replacements", () => {
    const input = new PracticeTextInput();
    input.read({ value: "ka" });
    expect(input.read({ value: "shi", inputType: "insertText" }).text).toBe("");
    expect(input.read({ value: "sahi", inputType: "insertCompositionText", isComposing: true }).text).toBe("");
    expect(input.read({ value: "sahi" }).text).toBe("");
    expect(input.read({ value: "sahina" }).text).toBe("na");
  });

  it("requests the English keyboard when composition replaces Latin text with kana", () => {
    const input = new PracticeTextInput();
    input.read({ value: "k", isComposing: true });
    expect(input.read({ value: "か", inputType: "insertCompositionText", isComposing: true }))
      .toEqual({ text: "", invalid: true });
    expect(input.read({ value: "か" }).text).toBe("");
    expect(input.read({ value: "かa" }).text).toBe("a");
  });

  it.each(["あ", "ａ", "Ａ", "é", "aあ", "a ", "\n", "123", "’", "—", "😀"])(
    "rejects unsupported text %s without partially consuming or replaying it",
    (value) => {
      const input = new PracticeTextInput();
      expect(input.read({ value })).toEqual({ text: "", invalid: true });
      expect(input.read({ value })).toEqual({ text: "", invalid: false });
      expect(input.read({ value: `${value}ka` }).text).toBe("ka");
    },
  );

  it("discards blocked input, including an in-flight composition, until new letters arrive", () => {
    const input = new PracticeTextInput();
    input.read({ value: "k", isComposing: true });
    expect(input.read({ value: "ka", isComposing: true, blocked: true }).text).toBe("");
    expect(input.read({ value: "kan", isComposing: true, blocked: true }).text).toBe("");
    expect(input.read({ value: "kan", inputType: "insertFromComposition" }).text).toBe("");
    expect(input.read({ value: "kana" }).text).toBe("a");
    expect(input.read({ value: "kanaあ", blocked: true }).invalid).toBe(false);
  });

  it("can reconcile with a cleared field or an existing DOM value", () => {
    const input = new PracticeTextInput();
    input.read({ value: "ka" });
    input.reset();
    expect(input.read({ value: "ka" }).text).toBe("ka");
    input.reset("shi");
    expect(input.read({ value: "shi" }).text).toBe("");
    expect(input.read({ value: "shika" }).text).toBe("ka");
  });

  it("lets the existing run score typos once without requiring deletion", () => {
    const input = new PracticeTextInput();
    const run = new PracticeRun([{ reading: "し", text: "し", statKey: "し" }], "kana");
    for (const value of ["x", "xS", "xSHI", "xSHI"]) {
      for (const key of input.read({ value }).text) run.input(key);
    }
    expect(run.matcher.done).toBe(true);
    expect(run.correct).toBe(3);
    expect(run.errors).toBe(1);
    expect(run.deltas["し"]).toMatchObject({ seen: 1, errors: 1 });
  });

  it("does not save rejected text to score after a run resumes", () => {
    const input = new PracticeTextInput();
    const run = new PracticeRun([{ reading: "か", text: "か" }], "kana");
    run.input(input.read({ value: "k" }).text);
    run.pause();
    expect(input.read({ value: "ka", blocked: run.paused }).text).toBe("");
    run.resume();
    expect(input.read({ value: "ka" }).text).toBe("");
    for (const key of input.read({ value: "kaa" }).text) run.input(key);
    expect(run.matcher.done).toBe(true);
    expect(run.correct).toBe(2);
    expect(run.errors).toBe(0);
  });
});
