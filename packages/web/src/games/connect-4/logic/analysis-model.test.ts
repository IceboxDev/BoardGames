import type { Grade, MoveGrade, Verdict } from "@boardgames/core/games/connect-4/solver/analysis";
import type { MoveRecord, Seat } from "@boardgames/core/games/connect-4/types";
import { describe, expect, it } from "vitest";
import {
  bestOf,
  graphValue,
  keepsResult,
  keyMoments,
  moveStory,
  nearBestOf,
  outcomeFromColumns,
  outcomeOf,
  playerSummary,
  practiceMoves,
  timeline,
} from "./analysis-model";

const win = (discs: number): Verdict => ({ kind: "win", discs });
const loss = (discs: number): Verdict => ({ kind: "loss", discs });
const draw: Verdict = { kind: "draw" };
const unknown: Verdict = { kind: "unknown" };

function grade(
  index: number,
  before: Verdict,
  after: Verdict,
  g: Grade,
  patch: Partial<MoveGrade> = {},
): MoveGrade {
  return {
    index,
    player: (index % 2) as Seat,
    column: 3,
    grade: g,
    before,
    after,
    bestColumns: [3],
    ...patch,
  };
}

const drops = (n: number): MoveRecord[] =>
  Array.from({ length: n }, (_, i) => ({
    type: "drop",
    column: i % 7,
    row: Math.floor(i / 7),
    player: (i % 2) as Seat,
  }));

describe("outcomes", () => {
  it("tells a verdict from the colour that wins", () => {
    expect(outcomeOf(win(3), 1)).toEqual({ kind: "win", winner: 1, discs: 3 });
    expect(outcomeOf(loss(2), 1)).toEqual({ kind: "win", winner: 0, discs: 2 });
    expect(outcomeOf(draw, 0)).toEqual({ kind: "draw" });
  });

  it("puts sooner wins further out on the graph, Red up, Yellow down", () => {
    const soon = graphValue({ kind: "win", winner: 0, discs: 1 }, 42) ?? 0;
    const late = graphValue({ kind: "win", winner: 0, discs: 15 }, 42) ?? 0;
    expect(soon).toBeGreaterThan(late);
    expect(late).toBeGreaterThan(0);
    expect(graphValue({ kind: "win", winner: 1, discs: 1 }, 42)).toBe(-soon);
    expect(graphValue({ kind: "draw" }, 42)).toBe(0);
    expect(graphValue({ kind: "over", winner: 0 }, 42)).toBe(1);
    expect(graphValue({ kind: "unknown" }, 42)).toBeNull();
  });
});

describe("timeline", () => {
  it("gives every ply its outcome, the last from how the game ended", () => {
    const moves = drops(3);
    const grades = {
      0: grade(0, win(4), win(4), "best"),
      2: grade(2, win(3), win(1), "inaccuracy"),
    };
    const points = timeline({ cols: 7, rows: 6, moves, winner: 0, reason: "connect" }, grades);
    expect(points.map((p) => p.ply)).toEqual([0, 1, 2, 3]);
    expect(points[0].outcome).toEqual({ kind: "win", winner: 0, discs: 4 });
    expect(points[1].outcome).toEqual({ kind: "unknown" }); // not graded yet
    expect(points[1].value).toBeNull();
    expect(points[3].outcome).toEqual({ kind: "over", winner: 0 });
  });

  it("reads a resigned game's last position from the last grade", () => {
    const moves = drops(2);
    const grades = { 1: grade(1, draw, loss(5), "mistake") };
    const points = timeline({ cols: 7, rows: 6, moves, winner: 0, reason: "resign" }, grades);
    // Yellow (seat 1) moved into a loss: Red wins.
    expect(points[2].outcome).toEqual({ kind: "win", winner: 0, discs: 5 });
  });
});

describe("move stories", () => {
  it("names each change of result", () => {
    expect(moveStory(grade(0, win(9), win(9), "best")).change).toBe("kept");
    expect(moveStory(grade(0, win(0), win(0), "good")).change).toBe("kept-result");
    // One disc off the best, graded good: it kept the result, nothing lost.
    expect(moveStory(grade(0, win(9), win(10), "good"))).toMatchObject({
      change: "kept",
      discsLost: 1,
    });
    expect(moveStory(grade(0, win(9), win(12), "inaccuracy"))).toMatchObject({
      change: "slower-win",
      discsLost: 3,
    });
    expect(moveStory(grade(0, loss(6), loss(3), "inaccuracy"))).toMatchObject({
      change: "faster-loss",
      discsLost: 3,
    });
    expect(moveStory(grade(0, win(9), draw, "mistake")).change).toBe("win-to-draw");
    expect(moveStory(grade(0, win(9), loss(4), "blunder")).change).toBe("win-to-loss");
    expect(moveStory(grade(0, draw, loss(4), "mistake")).change).toBe("draw-to-loss");
    expect(moveStory(grade(0, unknown, unknown, "unknown")).change).toBe("unknown");
  });

  it("tells the outcomes absolutely, from the mover's colour", () => {
    const story = moveStory(grade(1, win(9), draw, "mistake"));
    expect(story.before).toEqual({ kind: "win", winner: 1, discs: 9 });
    expect(story.after).toEqual({ kind: "draw" });
  });

  it("spots the only move, once every column is known", () => {
    const g = grade(0, win(9), win(9), "best", { column: 2, bestColumns: [2] });
    const columns: (Verdict | null)[] = [draw, null, win(9), loss(3), draw, draw, draw];
    expect(moveStory(g, columns).onlyMove).toBe(true);
    expect(moveStory(g, [...columns.slice(0, 6), win(11)]).onlyMove).toBe(false);
    expect(moveStory(g, [draw, null, win(9), undefined, draw, draw, draw]).onlyMove).toBe(false);
  });
});

describe("key moments and players", () => {
  const grades = {
    0: grade(0, win(18), win(18), "best"),
    1: grade(1, loss(18), loss(18), "best"),
    2: grade(2, win(17), draw, "mistake"),
    3: grade(3, draw, win(14), "best"),
    4: grade(4, loss(14), loss(10), "inaccuracy"),
    5: grade(5, win(10), loss(6), "blunder"),
  };

  it("lists every change of result, the last one decisive", () => {
    const moments = keyMoments(grades);
    expect(moments.map((m) => m.story.index)).toEqual([2, 5]);
    expect(moments.map((m) => m.decisive)).toEqual([false, true]);
  });

  it("counts each player's perfect moves and flaws", () => {
    const red = playerSummary(drops(6), grades, 0);
    expect(red).toMatchObject({ moves: 3, graded: 3, perfect: 1 });
    expect(red.flaws).toEqual({ inaccuracy: [4], mistake: [2], blunder: [] });
    const yellow = playerSummary(drops(6), grades, 1);
    expect(yellow.flaws.blunder).toEqual([5]);
    expect(practiceMoves(red)).toEqual([2]);
  });
});

describe("best columns", () => {
  it("prefers the result, then a sooner win or a later loss", () => {
    expect(bestOf([win(9), win(5), draw, null, win(5)], 0)).toEqual([1, 4]);
    expect(bestOf([loss(3), loss(8), loss(8)], 0)).toEqual([1, 2]);
    expect(bestOf([loss(3), draw], 0)).toEqual([1]);
  });

  it("reads the position's outcome off its best column", () => {
    expect(outcomeFromColumns([loss(3), win(6), win(4)], 1)).toEqual({
      kind: "win",
      winner: 1,
      discs: 4,
    });
    expect(outcomeFromColumns([win(4), undefined], 1)).toEqual({ kind: "unknown" });
  });

  it("counts a disc off the best as just as good, but not near the end", () => {
    expect(nearBestOf([win(9), win(10), win(11), draw, null], 0)).toEqual([0, 1]);
    expect(nearBestOf([loss(6), loss(5), loss(4)], 0)).toEqual([0, 1]);
    expect(nearBestOf([win(2), win(3)], 0)).toEqual([0]);
    expect(nearBestOf([draw, loss(9)], 0)).toEqual([0]);
  });

  it("waits until every open column is known", () => {
    expect(bestOf([win(5), undefined], 0)).toEqual([]);
    expect(bestOf([win(5), unknown], 0)).toEqual([]);
  });
});

describe("practice answers", () => {
  const before = { kind: "win", winner: 0, discs: 9 } as const;
  it("tells the best move from one that merely keeps the result, and a miss", () => {
    expect(keepsResult(win(9), before, 0)).toBe("best");
    expect(keepsResult(win(10), before, 0)).toBe("best"); // a disc off: as good
    expect(keepsResult(win(11), before, 0)).toBe("keeps");
    expect(keepsResult(draw, before, 0)).toBe("misses");
    expect(keepsResult(undefined, before, 0)).toBe("unknown");
    expect(keepsResult(draw, { kind: "draw" }, 1)).toBe("best");
  });
});
