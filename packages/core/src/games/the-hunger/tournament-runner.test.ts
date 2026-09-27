import { describe, expect, it } from "vitest";
import { seedForGame, simulateGame, theHungerSimulator } from "./tournament-runner";
import type { AIStrategyId } from "./types";

describe("the-hunger tournament runner", () => {
  it("plays a reproducible game and reports a winner with scores", () => {
    const seats: AIStrategyId[] = ["heuristic-v1", "random", "heuristic-v1"];
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

  it("simulates a ranked outcome for the tournament CLI", () => {
    const outcome = theHungerSimulator.simulate({
      strategies: ["heuristic-v1", "random"],
      seed: seedForGame(0),
    });
    expect(outcome.kind).toBe("ranked");
    if (outcome.kind === "ranked") expect(outcome.placements).toHaveLength(2);
  });

  it("rejects an unknown strategy", () => {
    expect(() => theHungerSimulator.simulate({ strategies: ["nope", "random"], seed: 1 })).toThrow(
      /Unknown The Hunger AI strategy/,
    );
  });
});
