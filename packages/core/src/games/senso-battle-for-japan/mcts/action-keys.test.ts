import { describe, expect, it } from "vitest";
import { buildKeyTable, cardOf } from "./action-keys";
import { CARD_ID, createFastRound, JADE, OUT, PLAYED, WOOD } from "./fast-round";

function base(setup: (owner: Int8Array) => void) {
  const f = createFastRound(2);
  f.owner.fill(OUT);
  setup(f.owner);
  return f;
}

describe("own-card equivalence classes", () => {
  it("collapses cards with no unseen card between them; played cards do not separate", () => {
    const f = base((o) => {
      o[cardOf(0, 2)] = 0;
      o[cardOf(0, 3)] = 0;
      o[cardOf(0, 5)] = 0; // 4 is unseen → new class
      o[cardOf(0, 6)] = PLAYED;
      o[cardOf(0, 7)] = 0; // joins the 5 (6 played, nothing unseen between)
      o[cardOf(1, 14)] = 0;
    });
    const keys = buildKeyTable(f, 0, true);
    expect(keys.own[cardOf(0, 2)]).toBe(keys.own[cardOf(0, 3)]);
    expect(keys.own[cardOf(0, 3)]).not.toBe(keys.own[cardOf(0, 5)]);
    expect(keys.own[cardOf(0, 5)]).toBe(keys.own[cardOf(0, 7)]);
    expect(keys.ownRep.get(keys.own[cardOf(0, 7)])).toBe(cardOf(0, 5));
    expect(keys.ownRep.get(keys.own[cardOf(0, 3)])).toBe(cardOf(0, 2));
    expect(keys.own[cardOf(1, 14)]).toBe(CARD_ID[cardOf(1, 14)]);
    expect(keys.own[WOOD]).toBe("ninja-wood");
    expect(keys.own[JADE]).toBe("ninja-jade");
  });

  it("is separated by another seat's card in a fully known world", () => {
    const f = base((o) => {
      o[cardOf(2, 5)] = 0;
      o[cardOf(2, 7)] = 1; // the opponent's card, not OUT
      o[cardOf(2, 9)] = 0;
    });
    const keys = buildKeyTable(f, 0, true);
    expect(keys.own[cardOf(2, 5)]).not.toBe(keys.own[cardOf(2, 9)]);
  });
});

describe("opponent buckets", () => {
  it("keys hidden cards by the count of known cards below them in the suit", () => {
    const f = base((o) => {
      o[cardOf(0, 3)] = 0;
      o[cardOf(0, 6)] = PLAYED;
    });
    const keys = buildKeyTable(f, 0, true);
    expect(keys.other[cardOf(0, 2)]).toBe("0:0");
    expect(keys.other[cardOf(0, 4)]).toBe("0:1");
    expect(keys.other[cardOf(0, 5)]).toBe("0:1");
    expect(keys.other[cardOf(0, 7)]).toBe("0:2");
    expect(keys.other[cardOf(0, 14)]).toBe("0:2");
    expect(keys.other[cardOf(2, 9)]).toBe("2:0");
    expect(keys.other[WOOD]).toBe("ninja-wood");
  });

  it("falls back to card identity when bucketing is off", () => {
    const f = base((o) => {
      o[cardOf(0, 3)] = 0;
    });
    const keys = buildKeyTable(f, 0, false);
    expect(keys.other[cardOf(0, 4)]).toBe(CARD_ID[cardOf(0, 4)]);
    expect(keys.other[cardOf(0, 5)]).toBe(CARD_ID[cardOf(0, 5)]);
  });
});
