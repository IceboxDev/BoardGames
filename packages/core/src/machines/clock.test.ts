import { describe, expect, it } from "vitest";
import {
  chargeMove,
  clockFace,
  initialClock,
  msUntilFlag,
  type TimeControl,
  TimeControlSchema,
} from "./clock";

const fischer: TimeControl = { kind: "fischer", mainSec: 60, incrementSec: 5, maxSec: 70 };
const byoyomi: TimeControl = { kind: "byoyomi", mainSec: 10, periods: 3, periodSec: 30 };

describe("clock", () => {
  it("parses time controls and rejects nonsense", () => {
    expect(TimeControlSchema.parse({ kind: "none" })).toEqual({ kind: "none" });
    expect(() =>
      TimeControlSchema.parse({ kind: "byoyomi", mainSec: 0, periods: 0, periodSec: 30 }),
    ).toThrow();
  });

  it("is untimed for none", () => {
    expect(msUntilFlag({ kind: "none" }, initialClock({ kind: "none" }))).toBe(
      Number.POSITIVE_INFINITY,
    );
  });

  it("charges Fischer moves, adds the increment and caps it", () => {
    let c = initialClock(fischer);
    expect(msUntilFlag(fischer, c)).toBe(60_000);
    c = chargeMove(fischer, c, 2_000) ?? c;
    expect(c.mainMs).toBe(63_000);
    c = chargeMove(fischer, c, 0) ?? c;
    c = chargeMove(fischer, c, 0) ?? c;
    expect(c.mainMs).toBe(70_000);
    expect(chargeMove(fischer, c, 70_000)).toBeNull();
  });

  it("runs byo-yomi: main time, then periods that reset on a timely move", () => {
    let c = initialClock(byoyomi);
    expect(msUntilFlag(byoyomi, c)).toBe(100_000);
    c = chargeMove(byoyomi, c, 15_000) ?? c; // 10s main + 5s into the first period
    expect(c).toEqual({ mainMs: 0, periodsLeft: 3 });
    c = chargeMove(byoyomi, c, 45_000) ?? c; // overran one period
    expect(c).toEqual({ mainMs: 0, periodsLeft: 2 });
    expect(chargeMove(byoyomi, c, 60_000)).toBeNull();
    expect(clockFace(byoyomi, c, 40_000)).toEqual({
      showMs: 20_000,
      inOvertime: true,
      periodsLeft: 1,
    });
  });
});
