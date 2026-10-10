import { describe, expect, it } from "vitest";
import { fromGtp } from "./coords";
import type { GoReplayLog } from "./replay-log";
import { parseSgf, SgfError, toSgf } from "./sgf";

const pt = (size: number, v: string) => fromGtp(size, v) as number;

const log: GoReplayLog = {
  formatVersion: 1,
  size: 19,
  komi: 0.5,
  handicap: 2,
  rules: "chinese",
  timeControl: { kind: "byoyomi", mainSec: 600, periods: 5, periodSec: 30 },
  players: [null, "mcts"],
  moves: [
    { c: 1, p: pt(19, "Q4"), ms: 1000 },
    { c: 0, p: pt(19, "C3"), ms: 2000 },
    { c: 1, p: null, ms: 10 },
    { c: 0, p: null, ms: 10 },
  ],
  undos: [],
  end: { reason: "resign", winner: 0, result: "B+R", dead: [] },
};

describe("sgf", () => {
  it("round-trips a handicap game", () => {
    const text = toSgf(log, { black: "Ann [x]", white: "Brook" });
    expect(text).toContain("HA[2]");
    expect(text).toContain("PB[Ann [x\\]]");
    const parsed = parseSgf(text);
    expect(parsed.size).toBe(19);
    expect(parsed.handicap).toBe(2);
    expect(parsed.komi).toBe(0.5);
    expect(parsed.black).toBe("Ann [x]");
    expect(parsed.result).toBe("B+R");
    expect(parsed.moves.map((m) => m.point)).toEqual(log.moves.map((m) => m.p));
  });

  it("follows the first variation and ignores the rest", () => {
    const parsed = parseSgf("(;GM[1]SZ[9];B[ee](;W[cc];B[gg])(;W[dd]))");
    expect(parsed.moves).toHaveLength(3);
    expect(parsed.moves[1]?.point).toBe(pt(9, "C7"));
  });

  it("rejects illegal moves, bad sizes and non-Go records", () => {
    expect(() => parseSgf("(;GM[1]SZ[9];B[ee];W[ee])")).toThrow(SgfError);
    expect(() => parseSgf("(;GM[1]SZ[25])")).toThrow(/not supported/);
    expect(() => parseSgf("(;GM[3]SZ[9])")).toThrow(/Not a Go/);
    expect(() => parseSgf("hello")).toThrow(SgfError);
  });
});
