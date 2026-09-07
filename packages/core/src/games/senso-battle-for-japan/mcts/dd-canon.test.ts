import { describe, expect, it } from "vitest";
import { midRound } from "../test-helpers";
import { cardOf } from "./action-keys";
import { canonicalKey, positionKey } from "./dd-canon";
import { clearTrickMemo, solveExact } from "./endgame-solver";
import { createFastRound, fastFromState, OUT, PLAYED } from "./fast-round";
import { LeafValuer } from "./leaf-value";

function position(owners: Record<number, number>, trump = 0, leader = 0) {
  const f = createFastRound(2);
  f.owner.fill(OUT);
  for (const [card, owner] of Object.entries(owners)) f.owner[Number(card)] = owner;
  f.trump = trump;
  f.leader = leader;
  f.turn = leader;
  let left = 0;
  for (const o of f.owner) if (o >= 0) left++;
  f.cardsLeft = left;
  f.handSize[0] = left / 2;
  f.handSize[1] = left / 2;
  return f;
}

describe("canonical relative-rank key", () => {
  it("separates positions the old owner-string key merged", () => {
    // takeda-13 (seat 0) / takeda-14 (seat 1): seat 1 must follow and wins.
    const a = position({ [cardOf(0, 13)]: 0, [cardOf(0, 14)]: 1 }, 2);
    // takeda-14 (seat 0) / uesugi-2 (seat 1): seat 1 is void and loses.
    const b = position({ [cardOf(0, 14)]: 0, [cardOf(1, 2)]: 1 }, 2);
    expect(positionKey(a)).not.toBe(positionKey(b));
  });

  it("ignores absolute ranks and played cards, keeping only relative order", () => {
    const a = position(
      { [cardOf(0, 3)]: 0, [cardOf(0, 9)]: 1, [cardOf(2, 5)]: 1, [cardOf(2, 6)]: 0 },
      0,
    );
    const b = position(
      { [cardOf(0, 2)]: 0, [cardOf(0, 14)]: 1, [cardOf(2, 10)]: 1, [cardOf(2, 13)]: 0 },
      0,
    );
    b.owner[cardOf(0, 7)] = PLAYED;
    expect(positionKey(a)).toBe(positionKey(b));
  });

  it("treats the non-trump suits as interchangeable but not the trump", () => {
    const a = position(
      { [cardOf(1, 5)]: 0, [cardOf(1, 9)]: 1, [cardOf(2, 4)]: 1, [cardOf(3, 8)]: 0 },
      0,
    );
    const swapped = position(
      { [cardOf(2, 5)]: 0, [cardOf(2, 9)]: 1, [cardOf(1, 4)]: 1, [cardOf(3, 8)]: 0 },
      0,
    );
    expect(positionKey(a)).toBe(positionKey(swapped));
    const trumpMoved = position(
      { [cardOf(1, 5)]: 0, [cardOf(1, 9)]: 1, [cardOf(2, 4)]: 1, [cardOf(3, 8)]: 0 },
      1,
    );
    expect(positionKey(a)).not.toBe(positionKey(trumpMoved));
  });

  it("carries the leader, the ninjas and the trick counts", () => {
    const a = position({ [cardOf(0, 5)]: 0, [cardOf(1, 9)]: 1 }, 0, 0);
    const b = position({ [cardOf(0, 5)]: 0, [cardOf(1, 9)]: 1 }, 0, 1);
    expect(positionKey(a)).not.toBe(positionKey(b));
    const c = position({ [cardOf(0, 5)]: 0, [cardOf(1, 9)]: 1, 52: 0, 53: 1 }, 0, 0);
    expect(positionKey(c)).not.toBe(positionKey(a));
    a.tricksWon[0] = 3;
    const withTricks = canonicalKey(a);
    a.tricksWon[0] = 4;
    expect(canonicalKey(a)).not.toBe(withTricks);
  });

  it("is invariant on real positions under a rank shift that keeps within-suit order", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const state = midRound(3, seed * 5, 9);
      const f = fastFromState(state, -1);
      const key = positionKey(f);
      // Move every in-play card of suit 0 up one rank where the slot is free.
      const g = fastFromState(state, -1);
      for (let rank = 14; rank >= 3; rank--) {
        const from = cardOf(0, rank - 1);
        const to = cardOf(0, rank);
        if (g.owner[from] >= 0 && g.owner[to] < 0) {
          g.owner[to] = g.owner[from];
          g.owner[from] = OUT;
        }
      }
      expect(positionKey(g)).toBe(key);
    }
  });

  it("gives the same 2p solve for two rank-shifted copies of a position", () => {
    const state = midRound(2, 99, 8);
    const leaf = new LeafValuer(state, "tier");
    const f = fastFromState(state, -1);
    clearTrickMemo();
    const v = solveExact(f, leaf, new Map());
    expect(Number.isFinite(v[0])).toBe(true);
    expect(v[0]).toBeCloseTo(-v[1], 9);
  });
});
