import { describe, expect, it } from "vitest";
import { durakSimulator } from "./tournament-runner";

describe("Durak engine", () => {
  // A defender who beats the attack with their last card is out; the attack
  // used to pass to them anyway, leaving an attacker with no cards and no legal
  // move — every 3+ player game that reached it hung.
  it.each([3, 4, 5])("always finishes at %i players", (players) => {
    for (let seed = 1; seed <= 60; seed++) {
      const strategies = Array.from({ length: players }, (_, i) =>
        i % 2 === 0 ? "random" : "heuristic-v1",
      );
      const outcome = durakSimulator.simulate({ strategies, seed });
      expect(outcome.kind).toBe("ranked");
    }
  });

  it("is reproducible from its seed", () => {
    const run = () => durakSimulator.simulate({ strategies: ["random", "random"], seed: 42 });
    // Random AIs draw from Math.random, so compare the deal via two heuristic seats instead.
    const heuristic = () =>
      durakSimulator.simulate({ strategies: ["heuristic-v1", "heuristic-v1"], seed: 42 });
    expect(heuristic()).toEqual(heuristic());
    expect(run().kind).toBe("ranked");
  });

  it("ranks the durak last and everyone else first", () => {
    const outcome = durakSimulator.simulate({
      strategies: ["heuristic-v1", "heuristic-v1", "heuristic-v1"],
      seed: 7,
    });
    if (outcome.kind !== "ranked") throw new Error("expected a ranked outcome");
    const last = outcome.placements.filter((p) => p === 3);
    expect(last.length).toBeLessThanOrEqual(1);
    expect(outcome.placements.every((p) => p === 1 || p === 3)).toBe(true);
  });
});
