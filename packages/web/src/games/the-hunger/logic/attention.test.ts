import type { Action } from "@boardgames/core/games/the-hunger/types";
import { describe, expect, it } from "vitest";
import { attentionFor } from "./attention";

const hunt: Action = { type: "hunt", row: 0, col: 0 };

describe("attentionFor", () => {
  it("lights nothing when it isn't your decision", () => {
    expect([...attentionFor(undefined, [hunt], null)]).toEqual([]);
  });

  it("sends step 1 to your board, moves and pushes to the map", () => {
    expect([...attentionFor("manipulate", [], null)]).toEqual(["player"]);
    expect([...attentionFor("move", [{ type: "stay" }], null)]).toEqual(["map"]);
    expect([...attentionFor("push", [], null)]).toEqual(["map"]);
    expect([...attentionFor("inspire", [], null)]).toEqual(["map"]);
  });

  it("lights the Hunt when a pile can be hunted, the map for the Labyrinth and Tavern", () => {
    expect([...attentionFor("act", [hunt], null)]).toEqual(["shop"]);
    expect([...attentionFor("act", [{ type: "hunt-tavern" }], null)]).toEqual(["map"]);
    expect([...attentionFor("act", [{ type: "end-turn" }], null)]).toEqual([]);
  });

  it("follows a pick in progress to the view that finishes it", () => {
    expect(attentionFor("act", [], { kind: "hypnosis" }).has("shop")).toBe(true);
    expect(attentionFor("act", [], { kind: "card" }).has("player")).toBe(true);
    const chest: Action = { type: "instant", mission: "treasure-chest", space: "boat-10" };
    expect([...attentionFor("act", [chest], { kind: "instant" })]).toEqual(["map"]);
    const free: Action = { type: "instant", mission: "m", row: 0, col: 1 };
    expect([...attentionFor("act", [free], { kind: "instant" })]).toEqual(["shop"]);
  });
});
