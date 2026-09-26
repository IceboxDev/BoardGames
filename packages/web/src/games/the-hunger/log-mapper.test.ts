import { buildPlayerView } from "@boardgames/core/games/the-hunger/player-view";
import { simulate } from "@boardgames/core/games/the-hunger/simulate";
import { describe, expect, it } from "vitest";
import { mapHungerLog } from "./log-mapper";

describe("mapHungerLog", () => {
  it("groups a whole game into turn blocks, oldest first, ending at sunrise", () => {
    const { state } = simulate(["heuristic-v1", "heuristic-v1"], 12);
    const view = buildPlayerView(state, 0);
    const blocks = mapHungerLog(view.log, view, []);
    expect(blocks[0].label).toBe("Setup");
    expect(blocks[1].label).toBe("Turn 1");
    expect(blocks[blocks.length - 1].label).toBe("Sunrise");
    expect(blocks[blocks.length - 1].actions).toHaveLength(2);
    for (const b of blocks) {
      for (const a of b.actions) expect(a.spans.length).toBeGreaterThan(0);
    }
  });
});
