import { buildPlayerView } from "@boardgames/core/games/the-hunger/player-view";
import { act, afterSetup, rigTurn } from "@boardgames/core/games/the-hunger/test-helpers";
import { describe, expect, it } from "vitest";
import { speedReadout } from "./speed";

const hand = ["vampiric-speed-3#0", "vampire-speed-2#0-0", "vampire-thirst#0-0"];

describe("speedReadout", () => {
  it("shows the Speed the cards in play will give during step 1", () => {
    // Vampiric Will has a step-1 effect, so step 1 stays open.
    const state = rigTurn(afterSetup(2, 7), 0, {
      hand: ["vampiric-will#0", "vampire-speed-2#0-0", "vampire-thirst#0-0"],
      pos: "road-4",
    });
    expect(state.current?.step).toBe("manipulate");
    const r = speedReadout(buildPlayerView(state, 0));
    expect(r?.label).toBe("Speed this turn");
    expect(r?.live).toBe(true);
    // Will 1 + Speed 2 + Vampire Thirst's 1 (no Human in play).
    expect(r?.value).toBe(4);
  });

  it("counts down what is left once movement starts, with the Hunts still open", () => {
    let state = rigTurn(afterSetup(2, 7), 0, { hand, pos: "road-4" });
    if (state.current?.step === "manipulate") state = act(state, { type: "end-manipulation" });
    state = act(state, { type: "stay" });
    const r = speedReadout(buildPlayerView(state, 0));
    expect(r?.label).toBe("Speed left");
    expect(r?.value).toBe(state.current?.speedLeft);
    expect(r?.of).toBe(state.current?.speed);
    expect(r?.hunts).toBeGreaterThanOrEqual(1);
  });

  it("previews next turn's hand for a Vampire who is waiting", () => {
    const state = rigTurn(afterSetup(2, 7), 0, { hand, pos: "road-4" });
    const r = speedReadout(buildPlayerView(state, 1));
    expect(r?.label).toBe("Next turn");
    expect(r?.live).toBe(false);
  });
});
