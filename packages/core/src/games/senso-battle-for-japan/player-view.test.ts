import { describe, expect, it } from "vitest";
import { createInitialState } from "./game-engine";
import { buildPlayerView } from "./player-view";

describe("buildPlayerView", () => {
  it("shows only the viewer's hand, hides the seed, and counts the others", () => {
    const state = createInitialState(3, [null, "random", "random"], 21);
    const view = buildPlayerView(state, 0);
    expect(view.me).toBe(0);
    expect(view.hand).toEqual(state.players[0].hand);
    expect(view.players.map((p) => p.handCount)).toEqual([6, 6, 6]);
    const json = JSON.stringify(view);
    expect(json).not.toContain('"seed"');
    for (const card of [...state.players[1].hand, ...state.players[2].hand]) {
      expect(json).not.toContain(`"${card}"`);
    }
    expect(view.scores).toHaveLength(3);
  });

  it("gives a spectator no hand and no clan", () => {
    const state = createInitialState(2, [null, null], 3);
    const view = buildPlayerView(state, -1);
    expect(view.me).toBe(-1);
    expect(view.hand).toEqual([]);
    expect(view.myClan).toBeNull();
  });
});
