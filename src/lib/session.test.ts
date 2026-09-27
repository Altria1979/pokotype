import { describe, expect, it } from "vitest";
import { ActiveTimer, summarize } from "./session";

describe("active timing and summary", () => {
  it("starts only on the first input and excludes time while paused", () => {
    const timer = new ActiveTimer();
    timer.resume(10);
    expect(timer.elapsed(1000)).toBe(0);
    timer.start(1000);
    timer.start(2000);
    expect(timer.elapsed(2500)).toBe(1500);
    timer.pause(3000);
    timer.pause(4000);
    expect(timer.elapsed(20_000)).toBe(2000);
    timer.resume(20_000);
    timer.resume(21_000);
    expect(timer.elapsed(22_000)).toBe(4000);
  });
  it("calculates attempted-key accuracy and active CPM without division by zero", () => {
    expect(summarize(90, 10, 30_000)).toEqual({ accuracy: 90, cpm: 180 });
    expect(summarize(0, 0, 0)).toEqual({ accuracy: 0, cpm: 0 });
  });
});
