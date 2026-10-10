import { beforeAll, describe, expect, it } from "vitest";
import { createRng } from "../../../lib/rng";
import { boardAfter, createBoard } from "../rules";
import type { MoveRecord, Seat } from "../types";
import {
  evaluateColumns,
  evaluatePosition,
  gradeFromScores,
  gradeGame,
  nearBestMoves,
  solverFor,
  solverSupport,
  type Verdict,
} from "./analysis";
import { BitSolver, discsToWin } from "./bitboard-solver";
import { bookDepth, loadOpeningBook, openingBook } from "./book";

function drops(columns: number[], first: Seat = 0): MoveRecord[] {
  const heights: number[] = [];
  return columns.map((column, i) => {
    const row = heights[column] ?? 0;
    heights[column] = row + 1;
    return { type: "drop", column, row, player: (i % 2 === 0 ? first : 1 - first) as Seat };
  });
}

/** A random drop-only line of `length` discs with no four in it. */
function randomLine(solver: BitSolver, cols: number, length: number, seed: number): number[] {
  const rng = createRng(seed);
  for (;;) {
    const line: number[] = [];
    solver.setMoves([]);
    let stuck = 0;
    while (line.length < length && stuck < 50) {
      const c = Math.floor(rng() * cols);
      if (!solver.canPlay(c) || solver.isWinningMove(c)) {
        stuck++;
        continue;
      }
      solver.playColumn(c);
      line.push(c);
    }
    if (line.length === length) return line;
  }
}

beforeAll(async () => {
  await loadOpeningBook(6, 5);
});

describe("opening book", () => {
  it("covers 6×5, and its answers match a fresh solve", () => {
    expect(bookDepth(6, 5)).toBe(8);
    const book = openingBook(6, 5);
    expect(book).not.toBeNull();
    const fresh = new BitSolver(6, 5, 20);
    // Late book positions: a bookless solve of these is quick.
    for (let seed = 1; seed <= 12; seed++) {
      const moves = randomLine(fresh, 6, 6 + (seed % 3), seed);
      fresh.setMoves(moves);
      const k = fresh.key();
      const score = fresh.solve();
      expect(book?.(k.lo, k.hi, k.mirrorLo, k.mirrorHi, moves.length), moves.join("")).toBe(score);
      // A mirror pair is one entry, found from either side.
      expect(book?.(k.mirrorLo, k.mirrorHi, k.lo, k.hi, moves.length)).toBe(score);
    }
  });

  it("answers nothing past its depth", () => {
    const solver = new BitSolver(6, 5, 10);
    solver.setMoves(randomLine(solver, 6, 9, 3));
    const k = solver.key();
    expect(openingBook(6, 5)?.(k.lo, k.hi, k.mirrorLo, k.mirrorHi, 9)).toBeUndefined();
  });

  it("has no book for 8×7", async () => {
    expect(await loadOpeningBook(8, 7)).toBeNull();
    expect(bookDepth(8, 7)).toBe(-1);
  });
});

describe("BitSolver.bestColumns", () => {
  it("names exactly the columns `analyze` scores best, exact and win/draw/loss", () => {
    const solver = new BitSolver(6, 5, 20);
    for (let seed = 1; seed <= 15; seed++) {
      const line = randomLine(solver, 6, 6 + (seed % 10), seed);
      solver.setMoves(line);
      if (solver.canWinNext()) continue;
      const scores = solver.analyze();
      const top = Math.max(...scores.filter((s): s is number => s !== null));
      const expected = scores.flatMap((s, c) => (s === top ? [c] : []));
      solver.setMoves(line);
      expect(solver.bestColumns(solver.solve()), line.join("")).toEqual(expected);

      const weak = Math.sign(top);
      const keepsClass = scores.flatMap((s, c) =>
        s !== null && (weak < 0 || Math.sign(s) === weak) ? [c] : [],
      );
      solver.setMoves(line);
      expect(solver.bestColumns(solver.solve(true), true), line.join("")).toEqual(keepsClass);
    }
  });
});

describe("column values", () => {
  /** A verdict as the mover's score on `analyze`'s scale. */
  const scoreOf = (v: Verdict | null, cells: number, discs: number): number | null => {
    if (v === null) return null;
    if (v.kind === "draw") return 0;
    if (v.kind !== "win" && v.kind !== "loss") throw new Error("unsolved");
    // Invert discsToWin: the winner's total discs, then the score.
    const winnerPlaced = v.kind === "win" ? discs >> 1 : discs - (discs >> 1);
    const score = cells / 2 + 1 - (v.discs + winnerPlaced);
    return v.kind === "win" ? score : -score;
  };

  it("agrees with `analyze` column by column", () => {
    const solver = new BitSolver(6, 5, 20);
    for (let seed = 1; seed <= 10; seed++) {
      const line = randomLine(solver, 6, 8 + (seed % 8), seed);
      solver.setMoves(line);
      const expected = solver.analyze();
      const columns = evaluateColumns(
        {
          cols: 6,
          rows: 5,
          popOut: false,
          board: boardAfter(6, 5, drops(line)),
          toMove: (line.length % 2) as Seat,
        },
        5_000_000,
      );
      expect(
        columns.map((v) => scoreOf(v, 30, line.length)),
        line.join(""),
      ).toEqual(expected);
    }
  });

  it("answers a full column with null and a winning drop as a win with this disc", () => {
    // Column 0 full (5 discs, alternating); Red then stacks column 1 three high.
    const line = [0, 0, 0, 0, 0, 2, 1, 2, 1, 3, 1, 4];
    const columns = evaluateColumns(
      {
        cols: 6,
        rows: 5,
        popOut: false,
        board: boardAfter(6, 5, drops(line)),
        toMove: 0,
      },
      2_000_000,
    );
    expect(columns[0]).toBeNull();
    expect(columns[1]).toEqual({ kind: "win", discs: 1 });
  });

  it("knows nothing about PopOut columns", () => {
    const columns = evaluateColumns(
      { cols: 6, rows: 5, popOut: true, board: createBoard(6, 5), toMove: 0 },
      1_000,
    );
    expect(columns.every((v) => v?.kind === "unknown")).toBe(true);
  });
});

describe("near-best moves (the Perfect bot's pool)", () => {
  it("takes every move within a disc of the best, only the best near the end, never worse", () => {
    const solver = new BitSolver(6, 5, 20);
    let widened = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const line = randomLine(solver, 6, 6 + (seed % 9), seed);
      solver.setMoves(line);
      if (solver.canWinNext()) continue;
      const scores = solver.analyze();
      const best = Math.max(...scores.filter((s): s is number => s !== null));
      solver.setMoves(line);
      const discs = discsToWin(best, 30, line.length) ?? 0;
      const floor = best === 0 || discs <= 2 ? best : best > 0 ? Math.max(1, best - 1) : best - 1;
      const expected = scores.flatMap((s, c) => (s !== null && s >= floor ? [c] : []));
      const got = nearBestMoves(
        {
          cols: 6,
          rows: 5,
          popOut: false,
          board: boardAfter(6, 5, drops(line)),
          toMove: (line.length % 2) as Seat,
        },
        5_000_000,
      ).map((m) => m.column);
      expect(got, line.join("")).toEqual(expected);
      // Never a move that changes the result.
      for (const c of got) expect(Math.sign(scores[c] ?? 0), line.join("")).toBe(Math.sign(best));
      // Grading agrees with the bot: what it may play is best or good, the rest that keep
      // the result are inaccuracies.
      const exact = (score: number) => ({ score, weak: false });
      for (const [c, score] of scores.entries()) {
        if (score === null || Math.sign(score) !== Math.sign(best)) continue;
        const grade = gradeFromScores(exact(best), exact(score), discs);
        expect(grade, `${line.join("")} col ${c}`).toBe(
          got.includes(c) ? (score === best ? "best" : "good") : "inaccuracy",
        );
      }
      if (got.length > scores.filter((s) => s === best).length) widened++;
    }
    expect(widened).toBeGreaterThan(0); // the slack is really used
  });
});

describe("evaluation", () => {
  it("answers the empty 6×5 board at once from its book", () => {
    const evaluation = evaluatePosition(
      { cols: 6, rows: 5, popOut: false, board: createBoard(6, 5), toMove: 0 },
      50_000,
    );
    expect(evaluation.solved && evaluation.exact).toBe(true);
    expect(evaluation.best.length).toBeGreaterThan(0);
  });

  it("still names a move when its book answers a position whose children it can't search", () => {
    // The book's deepest level is answered at once; its children need a real search.
    const solver = new BitSolver(6, 5, 10);
    let line = randomLine(solver, 6, 8, 1);
    for (let seed = 2; solver.canWinNext(); seed++) line = randomLine(solver, 6, 8, seed);
    const input = {
      cols: 6,
      rows: 5,
      popOut: false,
      board: boardAfter(6, 5, drops(line)),
      toMove: 0 as Seat,
    };
    solverFor(6, 5).clearTable(); // starved for real: nothing remembered from other tests
    const starved = evaluatePosition(input, 20);
    expect(starved.solved && starved.exact).toBe(true);
    expect(starved.best).toHaveLength(1); // the search's suggestion
    expect(evaluatePosition(input, 20, null).best).toEqual([]);
  });

  it("says why it can't solve: 8×7's opening, PopOut", () => {
    expect(solverSupport(8, 7, false, 2)).toBe("too-early");
    expect(solverSupport(8, 7, false, 20)).toBe("ok");
    expect(solverSupport(6, 5, true, 20)).toBe("popout");
    const early = evaluatePosition(
      { cols: 8, rows: 7, popOut: false, board: createBoard(8, 7), toMove: 0 },
      1_000,
      null,
    );
    expect(early).toEqual({ solved: false, reason: "too-early", best: [] });
    const popOut = evaluatePosition(
      { cols: 6, rows: 5, popOut: true, board: createBoard(6, 5), toMove: 0 },
      1_000,
    );
    expect(popOut.solved).toBe(false);
    expect(popOut.best).toHaveLength(1); // the deep search's suggestion
  });

  it("gives a quick win/draw/loss answer first when asked", () => {
    const board = boardAfter(6, 5, drops([2, 3, 2, 3]));
    const weak = evaluatePosition(
      { cols: 6, rows: 5, popOut: false, board, toMove: 0 },
      50_000,
      null,
      true,
    );
    expect(weak.solved && !weak.exact).toBe(true);
  });
});

describe("grades", () => {
  it("grades by result class, and by speed when exact", () => {
    const exact = (score: number) => ({ score, weak: false });
    const weak = (score: number) => ({ score, weak: true });
    expect(gradeFromScores(exact(3), exact(3))).toBe("best");
    expect(gradeFromScores(exact(3), exact(1))).toBe("inaccuracy");
    // One disc off the best is good — as the Perfect bot plays — unless the end is near.
    expect(gradeFromScores(exact(3), exact(2), 9)).toBe("good");
    expect(gradeFromScores(exact(3), exact(1), 9)).toBe("inaccuracy");
    expect(gradeFromScores(exact(-4), exact(-5), 9)).toBe("good");
    expect(gradeFromScores(exact(3), exact(2), 2)).toBe("inaccuracy");
    expect(gradeFromScores(exact(1), exact(0), 9)).toBe("mistake"); // never across a result
    expect(gradeFromScores(exact(3), exact(0))).toBe("mistake");
    expect(gradeFromScores(exact(3), exact(-2))).toBe("blunder");
    expect(gradeFromScores(exact(0), exact(-2))).toBe("mistake");
    expect(gradeFromScores(weak(1), exact(2))).toBe("good");
    expect(gradeFromScores(weak(1), weak(-1))).toBe("blunder");
  });

  it("grades a finished game, and catches a missed win", () => {
    const solver = new BitSolver(6, 5, 18);
    for (let seed = 1; seed < 60; seed++) {
      const prefix = randomLine(solver, 6, 10, seed);
      solver.setMoves(prefix);
      if (solver.canWinNext()) continue;
      const scores = solver.analyze();
      const bad = scores.findIndex((s) => s !== null && s < 0);
      if (Math.max(...scores.filter((s) => s !== null)) <= 0 || bad < 0) continue;
      const seen: number[] = [];
      const grades = gradeGame(6, 5, drops([...prefix, bad]), 2_000_000, (g) => seen.push(g.index));
      expect(seen[0]).toBe(prefix.length); // last move first
      const last = grades.at(-1);
      expect(last?.index).toBe(prefix.length);
      expect(last?.grade).toBe("blunder");
      expect(last?.before.kind).toBe("win");
      expect(last?.after.kind).toBe("loss");
      expect(last?.bestColumns.length).toBeGreaterThan(0);
      expect(grades.every((g) => g.grade !== "unknown")).toBe(true);
      return;
    }
    throw new Error("no winning position found");
  });

  it("grades a game that ends in four, the winning drop as best", () => {
    // Red stacks column 0 while Yellow wanders: Red's 4th disc there wins.
    const grades = gradeGame(6, 5, drops([0, 1, 0, 1, 0, 2, 0]), 1_000_000);
    expect(grades.at(-1)?.grade).toBe("best");
    expect(grades.at(-1)?.after).toEqual({ kind: "win", discs: 1 });
  });

  it("grades in slices exactly as in one go", () => {
    const solver = new BitSolver(6, 5, 18);
    const moves = drops(randomLine(solver, 6, 14, 7));
    const whole = gradeGame(6, 5, moves, 2_000_000);
    const sliced = [
      ...gradeGame(6, 5, moves, 2_000_000, undefined, { from: 0, to: 5 }),
      ...gradeGame(6, 5, moves, 2_000_000, undefined, { from: 5, to: 11 }),
      ...gradeGame(6, 5, moves, 2_000_000, undefined, { from: 11, to: moves.length }),
    ];
    expect(sliced).toEqual(whole);
  });

  it("marks 8×7's opening unknown without searching it", () => {
    const started = performance.now();
    const grades = gradeGame(8, 7, drops([3, 4, 3, 4]), 50_000_000);
    expect(grades.every((g) => g.grade === "unknown")).toBe(true);
    expect(performance.now() - started).toBeLessThan(500);
  });
});
