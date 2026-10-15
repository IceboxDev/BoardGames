import { START_FEN } from "@boardgames/core/games/chess/engine/fen";
import type { PositionEval } from "@boardgames/core/protocol";
import { describe, expect, it } from "vitest";
import { toNodeEval } from "./farm-evals";

const line = (uci: string, cp: number) => ({
  uci,
  cp,
  mate: null,
  depth: 50,
  seldepth: 70,
  nodes: 5e9,
  pv: [uci],
});

const result = (over: Partial<PositionEval>): PositionEval => ({
  fen: START_FEN,
  kind: "user",
  spec: "BEST_MOVE_V1",
  best: "e2e4",
  lines: [line("e2e4", 20)],
  lc0: null,
  ties: ["e2e4"],
  contested: false,
  depth: 50,
  source: "farm",
  engine: "stockfish dev",
  seconds: 120,
  ...over,
});

describe("farm results as tree data", () => {
  it("puts Leela's pick from a tie first", () => {
    const r = toNodeEval(
      result({
        best: "d2d4",
        lines: [line("e2e4", 20), line("d2d4", 12)],
        ties: ["e2e4", "d2d4"],
        lc0: [{ uci: "d2d4", w: 0.3, d: 0.6, l: 0.1, visits: 900 }],
      }),
    );
    expect(r.lines.map((l) => l.uci)).toEqual(["d2d4", "e2e4"]);
    expect(r).toMatchObject({ source: "farm", ties: ["e2e4", "d2d4"], contested: false });
  });

  it("keeps an opponent's lines in Stockfish's order", () => {
    const r = toNodeEval(
      result({
        kind: "opp",
        best: "e2e4",
        lines: [line("e2e4", 20), line("d2d4", 15), line("c2c4", 10)],
      }),
    );
    expect(r.lines.map((l) => l.uci)).toEqual(["e2e4", "d2d4", "c2c4"]);
  });
});
