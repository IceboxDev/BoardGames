import { describe, expect, it } from "vitest";
import { finalLines, parseInfo, parseLc0MoveStat } from "./uci.ts";

describe("farm UCI parsing", () => {
  it("reads Stockfish info lines and drops bound guesses", () => {
    const line =
      "info depth 42 seldepth 61 multipv 2 score cp -17 wdl 40 900 60 nodes 812345678 nps 31000000 hashfull 210 tbhits 0 time 26205 pv d2d4 g8f6 c2c4";
    expect(parseInfo(line)).toMatchObject({
      depth: 42,
      seldepth: 61,
      multipv: 2,
      cp: -17,
      mate: null,
      bound: false,
      nodes: 812345678,
      timeMs: 26205,
      pv: ["d2d4", "g8f6", "c2c4"],
      wdl: [40, 900, 60],
    });
    expect(parseInfo("info depth 9 score mate -3 nodes 10 pv h7h6")).toMatchObject({
      mate: -3,
      cp: null,
    });
    expect(parseInfo("info depth 30 score cp 20 lowerbound nodes 5 pv e2e4")?.bound).toBe(true);
    expect(parseInfo("info string NNUE evaluation enabled")).toBeNull();
  });

  it("keeps the deepest line per MultiPV index", () => {
    const infos = [
      "info depth 20 multipv 1 score cp 30 nodes 1 pv e2e4",
      "info depth 20 multipv 2 score cp 20 nodes 1 pv d2d4",
      "info depth 21 multipv 1 score cp 25 nodes 2 pv d2d4",
      "info depth 21 multipv 2 score cp 22 nodes 2 pv e2e4",
    ]
      .map((l) => parseInfo(l))
      .filter((x) => x !== null);
    expect(finalLines(infos).map((l) => [l.pv[0], l.depth])).toEqual([
      ["d2d4", 21],
      ["e2e4", 21],
    ]);
  });

  it("turns Lc0 move stats into win/draw/loss", () => {
    const s = parseLc0MoveStat(
      "e2e4  (322 ) N:  173210 (+ 0) (P: 11.32%) (WL: -0.01200) (D: 0.512) (M: 123.4) (Q: -0.01200) (U: 0.00012) (S: -0.01188) (V: -0.0150)",
    );
    expect(s).toMatchObject({ uci: "e2e4", visits: 173210, d: 0.512 });
    expect((s?.w ?? 0) - (s?.l ?? 0)).toBeCloseTo(-0.012, 5);
    expect(parseLc0MoveStat("node  ( 20) N: 1000 (+ 0)")).toBeNull();
  });
});
