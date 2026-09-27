import { describe, expect, it } from "vitest";
import { meanScoreBySide, seatPattern, simulateGame } from "./tournament-runner";
import type { AIStrategyId } from "./types";

describe("the-hunger tournament runner", () => {
  it("alternates seats by game parity", () => {
    expect(seatPattern("a", "b", 3, 0)).toEqual(["a", "b", "a"]);
    expect(seatPattern("a", "b", 3, 1)).toEqual(["b", "a", "b"]);
  });

  it("plays a reproducible game and reports a winner with scores", () => {
    const seats = seatPattern<AIStrategyId>("heuristic-v1", "random", 3, 4);
    const a = simulateGame(seats, 4);
    const b = simulateGame(seats, 4);
    expect(a).toEqual(b);
    expect(a.scores).toHaveLength(3);
    expect(a.winner).toBeGreaterThanOrEqual(-1);
    expect(a.winner).toBeLessThan(3);
  });

  it("honours the mode option", () => {
    const seats: AIStrategyId[] = ["heuristic-v1", "heuristic-v1"];
    expect(simulateGame(seats, 2, { mode: "rookie" }).scores).toHaveLength(2);
  });

  it("averages scores per side", () => {
    expect(meanScoreBySide(["a", "b", "a"], [10, 4, 20], "a")).toBe(15);
    expect(meanScoreBySide(["a", "b", "a"], [10, 4, 20], "b")).toBe(4);
    expect(meanScoreBySide(["a"], [], "a")).toBe(0);
  });
});
