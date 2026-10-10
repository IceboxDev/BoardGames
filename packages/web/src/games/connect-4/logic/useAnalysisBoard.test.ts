import type { MoveRecord, Seat } from "@boardgames/core/games/connect-4/types";
import { describe, expect, it } from "vitest";
import {
  type AnalysisAction,
  type AnalysisState,
  type BoardGame,
  derive,
  initialAnalysis,
  reduceAnalysis,
} from "./useAnalysisBoard";

/** A drop-only game from 0-based columns, Red first. */
function game(columns: number[], endedInFour = false): BoardGame {
  const heights: number[] = [];
  const moves: MoveRecord[] = columns.map((column, i) => {
    const row = heights[column] ?? 0;
    heights[column] = row + 1;
    return { type: "drop", column, row, player: (i % 2) as Seat };
  });
  return { cols: 7, rows: 6, firstPlayer: 0, moves, endedInFour };
}

const run = (g: BoardGame, actions: AnalysisAction[], from = initialAnalysis(g)): AnalysisState =>
  actions.reduce((s, a) => reduceAnalysis(s, a, g), from);

describe("analysis board", () => {
  const g = game([3, 3, 2, 4, 1]);

  it("starts at the end and shows the position after the selected move", () => {
    const start = initialAnalysis(g);
    expect(start.ply).toBe(5);
    const at2 = run(g, [{ type: "go", ply: 2 }]);
    const shown = derive(g, at2);
    expect(shown.moves).toHaveLength(2);
    expect(shown.board[3]).toEqual([0, 1, null, null, null, null]);
    expect(shown.toMove).toBe(0);
  });

  it("steps and clamps to the game", () => {
    expect(
      run(g, [
        { type: "go", ply: 0 },
        { type: "step", by: -1 },
      ]).ply,
    ).toBe(0);
    expect(run(g, [{ type: "step", by: 1 }]).ply).toBe(5);
    expect(run(g, [{ type: "go", ply: 99 }]).ply).toBe(5);
    expect(run(g, [{ type: "step", by: -1 }]).ply).toBe(4);
  });

  it("plays a side line from the shown position, ← undoing it, and leaves it for the game", () => {
    const line = run(g, [
      { type: "go", ply: 1 },
      { type: "play", column: 0 },
      { type: "play", column: 0 },
    ]);
    expect(line.line).toEqual([0, 0]);
    const shown = derive(g, line);
    expect(shown.moves.slice(1).map((m) => [m.column, m.row, m.player])).toEqual([
      [0, 0, 1],
      [0, 1, 0],
    ]);
    expect(run(g, [{ type: "step", by: -1 }], line).line).toEqual([0]);
    expect(run(g, [{ type: "step", by: 1 }], line)).toEqual(line);
    expect(run(g, [{ type: "go", ply: 3 }], line)).toMatchObject({ ply: 3, line: [] });
    expect(run(g, [{ type: "leave-line" }], line)).toMatchObject({ ply: 1, line: [] });
  });

  it("ends a side line at four, and plays nothing after a game won in four", () => {
    // Red stacks column 0 against a wandering Yellow; the line adds Red's fourth.
    const stack = game([0, 1, 0, 2, 0, 3]);
    const won = run(stack, [{ type: "play", column: 0 }]);
    const shown = derive(stack, won);
    expect(shown.lineEnd).toMatchObject({ kind: "four" });
    expect(shown.open).toEqual([]);
    expect(shown.position).toBeNull();
    expect(run(stack, [{ type: "play", column: 5 }], won)).toEqual(won);
    const finished = game([0, 1, 0, 2, 0, 3, 0], true);
    expect(derive(finished, initialAnalysis(finished)).open).toEqual([]);
  });

  it("refuses a full column", () => {
    const full = game([0, 0, 0, 0, 0, 0]);
    expect(derive(full, initialAnalysis(full)).open).not.toContain(0);
    expect(run(full, [{ type: "play", column: 0 }]).line).toEqual([]);
  });

  it("walks practice positions: misses, a reveal, a find, the end", () => {
    let s = run(g, [{ type: "practice", queue: [1, 3] }]);
    expect(s.ply).toBe(1); // the position before move 1 (0-based)
    s = run(g, [{ type: "go", ply: 4 }], s);
    expect(s.ply).toBe(1); // navigation is locked while practising
    s = run(g, [{ type: "answer", column: 0, result: "misses" }], s);
    expect(s.line).toEqual([]); // a miss isn't drawn in: the task's position stays
    expect(s.practice).toMatchObject({ tried: [0], last: 0, revealed: false });
    s = run(g, [{ type: "answer", column: 0, result: "misses" }], s);
    expect(s.practice).toMatchObject({ tried: [0], revealed: false }); // the same column twice
    s = run(g, [{ type: "answer", column: 6, result: "misses" }], s);
    expect(s.practice).toMatchObject({ tried: [0, 6], last: 6, revealed: true });
    s = run(g, [{ type: "answer", column: 3, result: "best" }], s);
    expect(s.line).toEqual([3]); // the find is drawn in
    expect(s.practice).toMatchObject({ solved: "best", found: 0 }); // revealed first
    s = run(g, [{ type: "next" }], s);
    expect(s).toMatchObject({ ply: 3, line: [] });
    expect(s.practice).toMatchObject({ at: 1, tried: [], last: null, solved: null });
    s = run(g, [{ type: "answer", column: 2, result: "keeps" }], s);
    expect(s.practice).toMatchObject({ solved: "keeps", found: 1 });
    s = run(g, [{ type: "next" }], s);
    expect(s.practice).toMatchObject({ at: 2, found: 1 });
    expect(run(g, [{ type: "stop-practice" }], s).practice).toBeNull();
  });

  it("judges practice on the task's position, even with the find drawn in", () => {
    const s = run(g, [
      { type: "practice", queue: [2] },
      { type: "answer", column: 0, result: "keeps" },
    ]);
    const shown = derive(g, s);
    expect(shown.moves).toHaveLength(3);
    expect(shown.base?.board).toEqual(derive(g, { ...s, line: [] }).board);
  });
});
