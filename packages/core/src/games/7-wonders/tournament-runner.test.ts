import { describe, expect, it } from "vitest";
import { sevenWondersSimulator } from "./tournament-runner";

describe("7 Wonders tournament simulator", () => {
  it("plays a whole game through the machine", async () => {
    const outcome = await sevenWondersSimulator.simulate({
      strategies: ["random", "random", "random", "random", "random"],
      seed: 7,
    });
    expect(outcome.kind).toBe("ranked");
    expect(outcome.kind === "ranked" && outcome.placements).toHaveLength(5);
  });

  it("refuses a search seat at a table the C++ engine can't play", () => {
    expect(() =>
      sevenWondersSimulator.simulate({ strategies: ["search", "random", "random"], seed: 1 }),
    ).toThrow(/5-player/);
  });
});
