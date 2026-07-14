import { describe, expect, it } from "vitest";
import { createInitialState } from "../game-engine";
import { getLegalActions } from "../rules";
import { chooseAiAction, setAiAgent } from "./agent";

describe("ai agent seam", () => {
  it("defaults to a legal random action", () => {
    const gs = createInitialState({ playerCount: 5, seed: 1, sideMode: "random" });
    setAiAgent(null);
    const a = chooseAiAction(gs, 0);
    expect(a).not.toBeNull();
  });

  it("falls back to random when the injected agent declines", () => {
    const gs = createInitialState({ playerCount: 5, seed: 2, sideMode: "random" });
    let called = 0;
    setAiAgent(() => {
      called++;
      return null;
    });
    const a = chooseAiAction(gs, 0);
    expect(called).toBe(1);
    expect(a).not.toBeNull();
    setAiAgent(null);
  });

  it("uses the injected agent's concrete action", () => {
    const gs = createInitialState({ playerCount: 5, seed: 3, sideMode: "random" });
    const chosen = getLegalActions(gs, 0)[0];
    setAiAgent(() => chosen);
    expect(chooseAiAction(gs, 0)).toEqual(chosen);
    setAiAgent(null);
  });
});
