import { describe, expect, it } from "vitest";
import { createInitialState } from "../game-engine";
import { getLegalActions } from "../rules";
import { canonOfAction, matchCanon, serializePosition } from "./cpp-bridge";

describe("cpp-bridge", () => {
  it("every legal action canonicalizes and matches back", () => {
    const gs = createInitialState({ playerCount: 5, seed: 7, sideMode: "random", edifice: true });
    for (let seat = 0; seat < 5; seat++) {
      for (const a of getLegalActions(gs, seat)) {
        const back = matchCanon(gs, seat, canonOfAction(a));
        expect(back).not.toBeNull();
        // matched action is canonically equivalent (duplicate cards collapse).
        if (back) expect(canonOfAction(back)).toEqual(canonOfAction(a));
      }
    }
  });

  it("serializes a position as a whitespace-separated integer stream", () => {
    const gs = createInitialState({ playerCount: 5, seed: 9, sideMode: "random" });
    const s = serializePosition(gs, 0);
    const ints = s.split(/\s+/);
    expect(ints.length).toBeGreaterThan(50);
    for (const t of ints) expect(Number.isInteger(Number(t))).toBe(true);
    // leading fields: seat=0, age=1, turn=1, phase=0 (selecting)
    expect(ints.slice(0, 4)).toEqual(["0", "1", "1", "0"]);
  });
});
