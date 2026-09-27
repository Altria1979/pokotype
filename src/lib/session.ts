/** Monotonic active time. Starting or resuming twice cannot double-count time. */
export class ActiveTimer {
  private accumulated = 0;
  private activeSince: number | null = null;
  private started = false;

  start(now = performance.now()): void {
    if (this.started) return;
    this.started = true;
    this.activeSince = now;
  }
  pause(now = performance.now()): void {
    if (this.activeSince === null) return;
    this.accumulated += Math.max(0, now - this.activeSince);
    this.activeSince = null;
  }
  resume(now = performance.now()): void {
    if (this.started && this.activeSince === null) this.activeSince = now;
  }
  elapsed(now = performance.now()): number {
    return (
      this.accumulated +
      (this.activeSince === null ? 0 : Math.max(0, now - this.activeSince))
    );
  }
}

export function summarize(
  correct: number,
  errors: number,
  durationMs: number,
): { accuracy: number; cpm: number } {
  return {
    accuracy: correct + errors > 0 ? (correct / (correct + errors)) * 100 : 0,
    cpm: durationMs > 0 ? correct / (durationMs / 60_000) : 0,
  };
}
