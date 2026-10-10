import { describe, expect, it } from "vitest";
import { createRng } from "../../../lib/rng";
import { BitSolver, BudgetExceeded, discsToWin } from "./bitboard-solver";

/** Pons' score by plain exhaustive negamax over column heights — the reference. */
function bruteForce(cols: number, rows: number, moves: number[]): number {
  const cells = cols * rows;
  const grid = new Int8Array(cells).fill(-1);
  const heights = new Int8Array(cols);
  let nb = 0;
  const wins = (c: number, r: number, who: number) => {
    const at = (x: number, y: number) =>
      x >= 0 && x < cols && y >= 0 && y < rows && grid[x * rows + y] === who;
    for (const [dc, dr] of [
      [1, 0],
      [0, 1],
      [1, 1],
      [1, -1],
    ]) {
      let n = 1;
      for (let k = 1; at(c + dc * k, r + dr * k); k++) n++;
      for (let k = 1; at(c - dc * k, r - dr * k); k++) n++;
      if (n >= 4) return true;
    }
    return false;
  };
  const play = (c: number) => {
    grid[c * rows + heights[c]] = nb & 1;
    heights[c]++;
    nb++;
  };
  const unplay = (c: number) => {
    heights[c]--;
    grid[c * rows + heights[c]] = -1;
    nb--;
  };
  for (const c of moves) play(c);
  const memo = new Map<string, number>();
  const negamax = (): number => {
    const key = grid.join(",");
    const known = memo.get(key);
    if (known !== undefined) return known;
    const who = nb & 1;
    for (let c = 0; c < cols; c++) {
      if (heights[c] < rows && wins(c, heights[c], who)) return (cells + 1 - nb) >> 1;
    }
    if (nb === cells) return 0;
    let best = -cells;
    for (let c = 0; c < cols; c++) {
      if (heights[c] >= rows) continue;
      play(c);
      best = Math.max(best, -negamax());
      unplay(c);
    }
    memo.set(key, best);
    return best;
  };
  return negamax();
}

describe("BitSolver", () => {
  it("matches exhaustive search on small boards", () => {
    const rng = createRng(42);
    for (const [cols, rows, prefix] of [
      [4, 4, 2],
      [5, 4, 6],
      [6, 5, 16],
    ] as const) {
      const solver = new BitSolver(cols, rows, 16);
      for (let trial = 0; trial < 8; trial++) {
        // A random prefix that hasn't been won yet.
        const moves: number[] = [];
        solver.setMoves([]);
        while (moves.length < prefix) {
          const c = Math.floor(rng() * cols);
          if (!solver.canPlay(c) || solver.isWinningMove(c)) continue;
          solver.playColumn(c);
          moves.push(c);
        }
        solver.setMoves(moves);
        expect(solver.solve(), `${cols}x${rows} ${moves.join("")}`).toBe(
          bruteForce(cols, rows, moves),
        );
      }
    }
  });

  it("solves Pons' published 7×6 test positions", () => {
    const solver = new BitSolver(7, 6, 18);
    // Positions (1-based columns) and scores from Pons' Test_L3_R1 / Test_L2_R1.
    for (const [seq, score] of [
      ["2252576253462244111563365343671351441", -1],
      ["7422341735647741166133573473242566", 1],
      ["23163416124767223154467471272416755633", 0],
      ["65214673556155731566316327373221417", -1],
    ] as const) {
      solver.setMoves([...seq].map((ch) => Number(ch) - 1));
      expect(solver.solve()).toBe(score);
      expect(solver.solve(true)).toBe(Math.sign(score));
    }
  });

  it("scores every column, and stops at its node budget", () => {
    const solver = new BitSolver(7, 6, 18);
    const moves = [..."7422341735647741166133573473242566"].map((ch) => Number(ch) - 1);
    solver.setMoves(moves);
    const scores = solver.analyze();
    for (let c = 0; c < 7; c++) {
      solver.setMoves(moves);
      if (!solver.canPlay(c)) {
        expect(scores[c]).toBeNull();
      } else if (solver.isWinningMove(c)) {
        expect(scores[c]).toBe((42 + 1 - moves.length) >> 1);
      } else {
        solver.playColumn(c);
        expect(scores[c]).toBe(-solver.solve() | 0);
      }
    }
    expect(Math.max(...scores.filter((s) => s !== null))).toBe(1);

    solver.setMoves([3, 3, 3]);
    solver.clearTable();
    solver.nodes = 0;
    solver.nodeBudget = 50;
    expect(() => solver.analyze()).toThrow(BudgetExceeded);
  });

  it("counts discs to the end", () => {
    // Side to move at 6 discs wins with its next disc: score (43 - 6) >> 1.
    expect(discsToWin(18, 42, 6)).toBe(1);
    expect(discsToWin(0, 42, 6)).toBeNull();
    // Losing with the opponent's 2nd disc from now (it has 3, wins with its 5th).
    expect(discsToWin(-17, 42, 6)).toBe(2);
  });
});
