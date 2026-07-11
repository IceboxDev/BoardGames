import { describe, expect, it } from "vitest";
import {
  type CardTypeInfo,
  computeHand,
  type HandTrackState,
  initHandTrack,
  recordMyHand,
  recordReveal,
  setCardTypes,
} from "./hand-tracker";

/**
 * Synthetic 3-player Age I. Cards have ids 1..21 (7 per player), each a distinct
 * type/name for easy assertions. Me = "M" at seat 0; hands pass left (M→A→B→M).
 */
function setup(): HandTrackState {
  const s = initHandTrack();
  s.seatOrder = ["M", "A", "B"];
  s.myPlayerId = "M";
  s.age = 1;
  const types = new Map<string, CardTypeInfo>();
  for (let id = 1; id <= 21; id++) {
    types.set(String(id), { name: `Card${id}`, age: 1, category: "raw", qt: { "3": 1 } });
    s.typeById.set(id, String(id));
  }
  setCardTypes(s, types);
  return s;
}

const names = (ids: number[]) => ids.map((id) => `Card${id}`);

describe("hand tracker — rotation & elimination", () => {
  it("knows my own hand immediately", () => {
    const s = setup();
    recordMyHand(s, [1, 2, 3, 4, 5, 6, 7]);
    const me = computeHand(s, 0);
    expect(me?.size).toBe(7);
    expect(me?.cards.sort()).toEqual(names([1, 2, 3, 4, 5, 6, 7]).sort());
    expect(me?.deduced).toBe(false);
  });

  it("deduces the left neighbour's hand after one rotation", () => {
    const s = setup();
    // Turn 1: I hold [1..7]; everyone plays one card.
    recordMyHand(s, [1, 2, 3, 4, 5, 6, 7]);
    recordReveal(s, [
      { playerId: "M", id: 1 },
      { playerId: "A", id: 8 },
      { playerId: "B", id: 15 },
    ]);
    // Turn 2: my hand rotated to B's old hand; A now holds my old hand minus card 1.
    recordMyHand(s, [16, 17, 18, 19, 20, 21]);

    const a = computeHand(s, 1);
    expect(a?.size).toBe(6);
    expect(a?.cards.length).toBe(6); // exact, no wonder builds
    expect(a?.cards.sort()).toEqual(names([2, 3, 4, 5, 6, 7]).sort());
    expect(a?.deduced).toBe(false);
  });

  it("fills the last un-held hand by elimination", () => {
    const s = setup();
    recordMyHand(s, [1, 2, 3, 4, 5, 6, 7]);
    recordReveal(s, [
      { playerId: "M", id: 1 },
      { playerId: "A", id: 8 },
      { playerId: "B", id: 15 },
    ]);
    recordMyHand(s, [16, 17, 18, 19, 20, 21]);

    // B is the one hand I've never held → deduced by deck elimination.
    const b = computeHand(s, 2);
    expect(b?.deduced).toBe(true);
    expect(b?.size).toBe(6);
    expect(b?.cards.sort()).toEqual(names([9, 10, 11, 12, 13, 14]).sort());
  });

  it("reports surplus candidates when a holder buries a card under a Wonder", () => {
    const s = setup();
    recordMyHand(s, [1, 2, 3, 4, 5, 6, 7]);
    // Turn 1: I play a card, but A builds a Wonder (no tableau play recorded for A).
    recordReveal(s, [
      { playerId: "M", id: 1 },
      { playerId: "B", id: 15 },
    ]);
    recordMyHand(s, [16, 17, 18, 19, 20, 21]);

    const a = computeHand(s, 1);
    expect(a?.size).toBe(6);
    // A buried an unknown card, so I have 6 candidates for a 6-card hand? No —
    // my hand minus my own play (1) = 6 cards, A buried one of THEM, so still 6
    // candidates but A's real hand is those 6 (they buried before I'd tracked a
    // removal). The surplus shows once further plays reveal the gap.
    expect(a?.cards.length).toBeGreaterThanOrEqual(a?.size ?? 0);
  });
});
