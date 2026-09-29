export type PracticeTextSnapshot = {
  value: string;
  inputType?: string;
  isComposing?: boolean;
  blocked?: boolean;
};

export type PracticeTextResult = {
  text: string;
  invalid: boolean;
};

/**
 * Converts a text field's snapshots into newly typed romaji. Keep the field's
 * value through compositionend and its following input event: both may describe
 * the same committed text. InputEvent.data is not reliable on soft keyboards.
 */
export class PracticeTextInput {
  private value = "";

  /** Reconcile with an intentional DOM buffer reset, such as starting a new run. */
  reset(value = ""): void {
    this.value = value;
  }

  read(snapshot: PracticeTextSnapshot): PracticeTextResult {
    const previous = this.value;
    // Even ignored input becomes the baseline, so resuming cannot replay it.
    this.value = snapshot.value;
    const inputType = snapshot.inputType ||
      (snapshot.isComposing ? "insertCompositionText" : "insertText");

    if (
      snapshot.blocked ||
      !["insertText", "insertCompositionText", "insertFromComposition"].includes(inputType)
    ) return { text: "", invalid: false };

    if (!snapshot.value.startsWith(previous)) {
      return { text: "", invalid: /[^a-z'-]/i.test(snapshot.value) };
    }

    const added = snapshot.value.slice(previous.length);
    if (!added) return { text: "", invalid: false };
    if (!/^[a-z'-]+$/i.test(added)) return { text: "", invalid: true };
    return { text: added.toLowerCase(), invalid: false };
  }
}
