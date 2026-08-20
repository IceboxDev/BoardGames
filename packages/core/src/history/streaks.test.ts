import { describe, expect, it } from "vitest";
import { activeWinStreak, type StreakResult, streakInfo } from "./streaks.ts";

const seq = (pattern: string): StreakResult[] =>
  [...pattern].map((c) => (c === "w" ? "win" : c === "l" ? "loss" : "draw"));

describe("streakInfo", () => {
  it("returns no run for an empty history", () => {
    expect(streakInfo([])).toEqual({ current: null, bestWin: 0 });
  });

  it("counts the live win run and the best win run separately", () => {
    // Four straight early, broken by a loss, then a live run of two.
    expect(streakInfo(seq("wwwwlww"))).toEqual({ current: { type: "win", length: 2 }, bestWin: 4 });
  });

  it("tracks a live losing run without inflating bestWin", () => {
    expect(streakInfo(seq("wwll"))).toEqual({ current: { type: "loss", length: 2 }, bestWin: 2 });
  });

  it("lets a draw break a run without starting one", () => {
    expect(streakInfo(seq("wwd"))).toEqual({ current: null, bestWin: 2 });
    expect(streakInfo(seq("wwdw"))).toEqual({ current: { type: "win", length: 1 }, bestWin: 2 });
  });

  it("reads oldest-first — reversing the input changes the live run", () => {
    expect(streakInfo(seq("llw")).current).toEqual({ type: "win", length: 1 });
    expect(streakInfo(seq("wll")).current).toEqual({ type: "loss", length: 2 });
  });
});

describe("activeWinStreak", () => {
  it("is the live run only when it is a winning one", () => {
    expect(activeWinStreak(seq("wwww"))).toBe(4);
    expect(activeWinStreak(seq("wwwl"))).toBe(0);
    expect(activeWinStreak(seq("wwwd"))).toBe(0);
    expect(activeWinStreak([])).toBe(0);
  });
});
