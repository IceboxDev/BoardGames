import { describe, expect, it } from "vitest";
import { applyActionPure } from "./game-engine";
import { behaviourOf, rebuildReplay } from "./replay";
import { simulate } from "./simulate";

describe("rebuildReplay", () => {
  // Choices the log never shows (which unused Mission goes back to a Crypt) may
  // differ: the rebuilt game matches the log and the result, not every hidden tile.
  it("recovers an action sequence that reproduces the log and the result", () => {
    const { state: end } = simulate(["heuristic-v1", "random", "heuristic-v1"], 4242);
    const result = end.result;
    if (!result) throw new Error("no result");
    const steps = rebuildReplay({
      seed: 4242,
      options: end.options,
      strategies: ["heuristic-v1", "random", "heuristic-v1"],
      log: end.log,
      breakdown: result.breakdown,
    });
    expect(steps).not.toBeNull();
    let s = steps?.[0].state;
    for (const step of steps ?? []) s = applyActionPure(step.state, step.seat, step.action);
    expect(s?.log).toEqual(end.log);
    expect(s?.result?.scores).toEqual(result.scores);

    const seats = behaviourOf(steps ?? [], end);
    expect(seats).toHaveLength(3);
    expect(seats.reduce((sum, b) => sum + b.won, 0)).toBeCloseTo(1);
    expect(seats.every((b) => b.hunts > 0)).toBe(true);
  }, 60_000);
});
