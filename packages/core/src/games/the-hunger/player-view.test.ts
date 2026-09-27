import { describe, expect, it } from "vitest";
import { buildPlayerView } from "./player-view";
import { afterSetup } from "./test-helpers";

describe("player view", () => {
  it("shows every draw pile's contents, sorted, never in deck order", () => {
    const s = afterSetup(2, 5);
    s.players[1].deck = ["ivo#0", "vampire-thirst#1-0", "echo#0", "o-nel#0"];
    const view = buildPlayerView(s, 0);
    const pile = view.players[1].drawPile;
    expect([...pile].sort()).toEqual([...s.players[1].deck].sort());
    // Starting cards first, then Powers, Familiars, Items, Humans; by name within.
    expect(pile).toEqual(["vampire-thirst#1-0", "echo#0", "ivo#0", "o-nel#0"]);
    expect(view.players[1].deckCount).toBe(4);
  });

  it("still hides other hands and other Missions", () => {
    const s = afterSetup(2, 5);
    s.players[1].hand = ["theresa#0", "roxane#0"];
    const view = buildPlayerView(s, 0);
    expect(view.players[1].handCount).toBe(2);
    expect(JSON.stringify(view)).not.toContain("theresa#0");
    expect(JSON.stringify(view.players[1])).not.toContain(s.players[1].missions[0]);
  });
});
