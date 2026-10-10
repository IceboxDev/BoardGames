import { describe, expect, it } from "vitest";
import { START_FEN } from "./engine/fen";
import { toPgn } from "./pgn";
import type { HistoryEntry } from "./schemas";

const entry = (san: string, by: "w" | "b", clockMs: number | null = null): HistoryEntry => ({
  uci: "e2e4",
  san,
  by,
  clockMs,
  captured: null,
});

describe("toPgn", () => {
  it("writes tags, numbered moves and the result", () => {
    const pgn = toPgn({
      startFen: START_FEN,
      moves: [entry("f3", "w"), entry("e5", "b"), entry("g4", "w"), entry("Qh4#", "b")],
      result: { winner: "b", termination: "checkmate" },
      timeControl: null,
      white: "You",
      black: "Club player",
      date: new Date("2026-10-09T12:00:00Z"),
    });
    expect(pgn).toContain('[White "You"]');
    expect(pgn).toContain('[Date "2026.10.09"]');
    expect(pgn).toContain('[Result "0-1"]');
    expect(pgn).toContain('[TimeControl "-"]');
    expect(pgn.trim().endsWith("1. f3 e5 2. g4 Qh4# 0-1")).toBe(true);
  });

  it("adds clocks and starts Black's first move with an ellipsis", () => {
    const fen = "4k3/8/8/8/8/8/8/4K2R b K - 0 12";
    const pgn = toPgn({
      startFen: fen,
      moves: [entry("Kd7", "b", 61_000), entry("O-O", "w", 3_725_000)],
      result: null,
      timeControl: { initialMs: 180_000, incrementMs: 2_000 },
      white: "A",
      black: 'B "quoted"',
    });
    expect(pgn).toContain('[FEN "4k3/8/8/8/8/8/8/4K2R b K - 0 12"]');
    expect(pgn).toContain('[TimeControl "180+2"]');
    expect(pgn).toContain('[Black "B quoted"]');
    expect(pgn).toContain("12... Kd7 {[%clk 0:01:01]} 13. O-O {[%clk 1:02:05]} *");
  });
});
