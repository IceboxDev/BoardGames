import { describe, expect, it } from "vitest";
import { createInitialState } from "../game-engine";
import { getLegalActions } from "../rules";
import { chooseAiAction } from "./agent";

describe("7 Wonders AI seats", () => {
  it("plays a legal random action without an agent", async () => {
    const gs = createInitialState({ playerCount: 5, seed: 1, sideMode: "random" });
    expect(await chooseAiAction(gs, 0, "search", null)).not.toBeNull();
    expect(await chooseAiAction(gs, 0, "random", null)).not.toBeNull();
  });

  it("falls back to random when the agent declines", async () => {
    const gs = createInitialState({ playerCount: 5, seed: 2, sideMode: "random" });
    let called = 0;
    const declining = async () => {
      called++;
      return null;
    };
    expect(await chooseAiAction(gs, 0, "search", declining)).not.toBeNull();
    expect(called).toBe(1);
  });

  it("uses the agent's action for a search seat, and never for a random one", async () => {
    const gs = createInitialState({ playerCount: 5, seed: 3, sideMode: "random" });
    const chosen = getLegalActions(gs, 0)[0];
    let called = 0;
    const agent = async () => {
      called++;
      return chosen;
    };
    expect(await chooseAiAction(gs, 0, "search", agent)).toEqual(chosen);
    await chooseAiAction(gs, 0, "random", agent);
    expect(called).toBe(1);
  });
});
