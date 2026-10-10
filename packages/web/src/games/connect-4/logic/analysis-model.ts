/**
 * What the analysis board shows, as data: every position's outcome, what each
 * move changed, the game's key moments and each player's record. Pure — the
 * solver's grades and column outcomes in, plain values out — so every rule
 * here is unit-tested; `text.ts` turns it into words.
 *
 * Conventions: ply `p` is the position after `p` moves (0 = the empty board);
 * move `i` (0-based, into `game.moves`) is the move that made ply `i + 1`.
 */

import {
  type Grade,
  type MoveGrade,
  SURE_DISCS,
  type Verdict,
} from "@boardgames/core/games/connect-4/solver/analysis";
import type { EndReason, MoveRecord, Seat } from "@boardgames/core/games/connect-4/types";

/** A position's outcome told absolutely: who wins and how soon, a draw, or a finished game. */
export type Outcome =
  /** `winner` places the winning disc as their `discs`-th from now (0: not counted). */
  | { kind: "win"; winner: Seat; discs: number }
  | { kind: "draw" }
  /** The game is over on this position (four in a row, or a full board). */
  | { kind: "over"; winner: Seat | null }
  | { kind: "unknown" };

/** A side's result class: what best play from here gets them. */
export type ResultClass = "win" | "draw" | "loss";

const otherSeat = (seat: Seat): Seat => (seat === 0 ? 1 : 0);

/** A verdict (told from `side`'s view, as the solver gives it) as an outcome. */
export function outcomeOf(verdict: Verdict, side: Seat): Outcome {
  switch (verdict.kind) {
    case "win":
      return { kind: "win", winner: side, discs: verdict.discs };
    case "loss":
      return { kind: "win", winner: otherSeat(side), discs: verdict.discs };
    case "draw":
      return { kind: "draw" };
    case "unknown":
      return { kind: "unknown" };
  }
}

/** Where an outcome leaves `seat`, or null when unknown. */
export function classFor(outcome: Outcome, seat: Seat): ResultClass | null {
  switch (outcome.kind) {
    case "unknown":
      return null;
    case "draw":
      return "draw";
    case "win":
    case "over":
      if (outcome.winner === null) return "draw";
      return outcome.winner === seat ? "win" : "loss";
  }
}

// ── The timeline ────────────────────────────────────────────────────────────

export interface PlyPoint {
  ply: number;
  outcome: Outcome;
  /** Red's standing for the graph: +1 Red won … 0 a draw … −1 Yellow won; null unknown. */
  value: number | null;
}

/** A position's height on the graph: a win sits further out the sooner it comes. */
export function graphValue(outcome: Outcome, cells: number): number | null {
  switch (outcome.kind) {
    case "unknown":
      return null;
    case "draw":
      return 0;
    case "over":
      return outcome.winner === null ? 0 : outcome.winner === 0 ? 1 : -1;
    case "win": {
      const most = Math.max(1, Math.ceil(cells / 2));
      const speed = outcome.discs === 0 ? 0.25 : 1 - (outcome.discs - 1) / most;
      const height = 0.35 + 0.55 * Math.max(0, speed);
      return outcome.winner === 0 ? height : -height;
    }
  }
}

export interface AnalysedGame {
  cols: number;
  rows: number;
  moves: readonly MoveRecord[];
  winner: Seat | null;
  reason: EndReason;
}

/** The outcome of the position after the last move: over, or (resigned) what the grade says. */
function finalOutcome(game: AnalysedGame, grades: Readonly<Record<number, MoveGrade>>): Outcome {
  if (game.reason === "connect") return { kind: "over", winner: game.winner };
  if (game.moves.length >= game.cols * game.rows) return { kind: "over", winner: null };
  const last = grades[game.moves.length - 1];
  return last ? outcomeOf(last.after, last.player) : { kind: "unknown" };
}

/** Every position's outcome, ply 0 to the end (unknown until graded). */
export function timeline(
  game: AnalysedGame,
  grades: Readonly<Record<number, MoveGrade>>,
): PlyPoint[] {
  const cells = game.cols * game.rows;
  const points: PlyPoint[] = [];
  for (let ply = 0; ply <= game.moves.length; ply++) {
    let outcome: Outcome;
    if (ply === game.moves.length) outcome = finalOutcome(game, grades);
    else {
      const grade = grades[ply];
      outcome = grade ? outcomeOf(grade.before, grade.player) : { kind: "unknown" };
    }
    points.push({ ply, outcome, value: graphValue(outcome, cells) });
  }
  return points;
}

// ── What a move changed ─────────────────────────────────────────────────────

export type Change =
  /** Kept the exact outcome (the best move). */
  | "kept"
  /** Kept the result; how fast isn't known. */
  | "kept-result"
  /** Still winning, but later than it could have. */
  | "slower-win"
  /** Still losing, but sooner than it had to. */
  | "faster-loss"
  | "win-to-draw"
  | "draw-to-loss"
  | "win-to-loss"
  | "unknown";

export interface MoveStory {
  index: number;
  player: Seat;
  column: number;
  grade: Grade;
  /** The position's outcome before the move (what the best move keeps) and after it. */
  before: Outcome;
  after: Outcome;
  change: Change;
  /** The columns that kept `before`. */
  best: readonly number[];
  /** How many discs it gave away: a slower win / faster loss, or (kept, good) the one disc forgiven. */
  discsLost: number;
  /** The only column that kept the result, and it was played (needs the column outcomes). */
  onlyMove: boolean;
}

const CLASS_RANK: Record<ResultClass, number> = { win: 2, draw: 1, loss: 0 };

/** How soon a verdict's win comes (0: not counted, or no win). */
function countOf(verdict: Verdict): number {
  return verdict.kind === "win" || verdict.kind === "loss" ? verdict.discs : 0;
}

function changeOf(grade: MoveGrade): { change: Change; discsLost: number } {
  const before = classFor(outcomeOf(grade.before, grade.player), grade.player);
  const after = classFor(outcomeOf(grade.after, grade.player), grade.player);
  // (A move can't do better than best play, so a rise means the grade is out of reach.)
  if (grade.grade === "unknown" || !before || !after || CLASS_RANK[after] > CLASS_RANK[before]) {
    return { change: "unknown", discsLost: 0 };
  }
  if (before !== after) {
    if (before === "win") {
      return { change: after === "draw" ? "win-to-draw" : "win-to-loss", discsLost: 0 };
    }
    return { change: "draw-to-loss", discsLost: 0 };
  }
  if (before === "draw") return { change: "kept", discsLost: 0 };
  const b = countOf(grade.before);
  const a = countOf(grade.after);
  if (b === 0 || a === 0) return { change: "kept-result", discsLost: 0 };
  if (a === b) return { change: "kept", discsLost: 0 };
  // A disc off the best is as good as the best (core `nearBest`): graded good, it kept the result.
  if (grade.grade === "good") return { change: "kept", discsLost: Math.abs(a - b) };
  return { change: before === "win" ? "slower-win" : "faster-loss", discsLost: Math.abs(a - b) };
}

/**
 * What move `grade.index` did. `columns`: the outcome of each column in the
 * position before it (mover's view), when known — for "the only move".
 */
export function moveStory(
  grade: MoveGrade,
  columns?: readonly (Verdict | null | undefined)[],
): MoveStory {
  const { change, discsLost } = changeOf(grade);
  const before = outcomeOf(grade.before, grade.player);
  const keepClass = classFor(before, grade.player);
  let onlyMove = false;
  // (The move that connects four is no "only move" — it's the end.)
  if (columns && keepClass !== null && change !== "unknown" && !connectsFour(grade)) {
    const known = columns.every((v) => v !== undefined && v?.kind !== "unknown");
    const keepers = columns.flatMap((v, c) =>
      v && classFor(outcomeOf(v, grade.player), grade.player) === keepClass ? [c] : [],
    );
    onlyMove = known && keepers.length === 1 && keepers[0] === grade.column;
  }
  return {
    index: grade.index,
    player: grade.player,
    column: grade.column,
    grade: grade.grade,
    before,
    after: outcomeOf(grade.after, grade.player),
    change,
    best: grade.bestColumns,
    discsLost,
    onlyMove,
  };
}

/** How good a column's outcome is for `mover`: result first, then a sooner win / later loss. */
function strength(verdict: Verdict, mover: Seat): number | null {
  const result = classFor(outcomeOf(verdict, mover), mover);
  if (result === null) return null;
  const count = countOf(verdict);
  if (result === "draw") return 0;
  // Uncounted wins rank below every counted one; uncounted losses above.
  if (result === "win") return 1000 - (count === 0 ? 999 : count);
  return -1000 + (count === 0 ? 999 : count);
}

/** The columns with the best outcome for `mover` (empty until every open column is known). */
export function bestOf(columns: readonly (Verdict | null | undefined)[], mover: Seat): number[] {
  const scored: { column: number; value: number }[] = [];
  for (const [column, verdict] of columns.entries()) {
    if (verdict === null) continue;
    if (verdict === undefined) return [];
    const value = strength(verdict, mover);
    if (value === null) return [];
    scored.push({ column, value });
  }
  const top = Math.max(...scored.map((s) => s.value));
  return scored.filter((s) => s.value === top).map((s) => s.column);
}

/**
 * The columns as good as the best for `mover`: the best, and those a disc off
 * it (a win a disc later, a defence a disc shorter) unless the result is
 * `SURE_DISCS` away — the core's `nearBest`, on verdicts. Empty until every
 * open column is known.
 */
export function nearBestOf(
  columns: readonly (Verdict | null | undefined)[],
  mover: Seat,
): number[] {
  const top = bestOf(columns, mover);
  const first = top[0] === undefined ? undefined : columns[top[0]];
  if (!first) return top;
  const topValue = strength(first, mover) ?? 0;
  const count = countOf(first);
  const forgiving = classFor(outcomeOf(first, mover), mover) !== "draw" && count > SURE_DISCS;
  if (!forgiving) return top;
  return columns.flatMap((verdict, column) => {
    if (!verdict) return [];
    const value = strength(verdict, mover);
    const sameResult =
      classFor(outcomeOf(verdict, mover), mover) === classFor(outcomeOf(first, mover), mover);
    return value !== null && sameResult && value >= topValue - 1 && countOf(verdict) > 0
      ? [column]
      : [];
  });
}

/** A position's outcome from its columns' (the best one's), once all are known. */
export function outcomeFromColumns(
  columns: readonly (Verdict | null | undefined)[],
  mover: Seat,
): Outcome {
  const [best] = bestOf(columns, mover);
  const verdict = best === undefined ? undefined : columns[best];
  return verdict ? outcomeOf(verdict, mover) : { kind: "unknown" };
}

/** The move itself made four in a row (it won with its own disc). */
export function connectsFour(grade: Pick<MoveGrade, "after">): boolean {
  return grade.after.kind === "win" && grade.after.discs === 1;
}

/** A change of result (not just of speed). */
export function changesResult(change: Change): boolean {
  return change === "win-to-draw" || change === "draw-to-loss" || change === "win-to-loss";
}

export interface KeyMoment {
  story: MoveStory;
  /** The last change of result: the one that decided the game. */
  decisive: boolean;
}

/** Every move that changed the result, in game order. */
export function keyMoments(grades: Readonly<Record<number, MoveGrade>>): KeyMoment[] {
  const stories = Object.values(grades)
    .sort((a, b) => a.index - b.index)
    .map((g) => moveStory(g))
    .filter((s) => changesResult(s.change));
  return stories.map((story, i) => ({ story, decisive: i === stories.length - 1 }));
}

// ── Each player's record ────────────────────────────────────────────────────

export type Flaw = "inaccuracy" | "mistake" | "blunder";
export const FLAWS = ["inaccuracy", "mistake", "blunder"] as const satisfies readonly Flaw[];

export interface PlayerSummary {
  seat: Seat;
  /** The seat's moves in this game, and how many are graded so far / were solvable. */
  moves: number;
  graded: number;
  /** Moves that kept the best outcome (best, or kept the result where speed is unknown). */
  perfect: number;
  /** Move indexes by flaw, in game order. */
  flaws: Record<Flaw, number[]>;
}

export function playerSummary(
  moves: readonly MoveRecord[],
  grades: Readonly<Record<number, MoveGrade>>,
  seat: Seat,
): PlayerSummary {
  const flaws: Record<Flaw, number[]> = { inaccuracy: [], mistake: [], blunder: [] };
  let mine = 0;
  let graded = 0;
  let perfect = 0;
  moves.forEach((move, i) => {
    if (move.player !== seat) return;
    mine++;
    const grade = grades[i];
    if (!grade || grade.grade === "unknown") return;
    graded++;
    if (grade.grade === "best" || grade.grade === "good") perfect++;
    else flaws[grade.grade].push(i);
  });
  return { seat, moves: mine, graded, perfect, flaws };
}

/** The moves practice walks through: a seat's mistakes and blunders, in game order. */
export function practiceMoves(summary: PlayerSummary): number[] {
  return [...summary.flaws.mistake, ...summary.flaws.blunder].sort((a, b) => a - b);
}

/** Did a practice answer keep the result the move threw away? */
export function keepsResult(
  answer: Verdict | null | undefined,
  before: Outcome,
  mover: Seat,
): "best" | "keeps" | "misses" | "unknown" {
  if (!answer || answer.kind === "unknown") return "unknown";
  const target = classFor(before, mover);
  const got = classFor(outcomeOf(answer, mover), mover);
  if (target === null || got === null) return "unknown";
  if (got !== target) return "misses";
  if (target === "draw") return "best";
  // Same result: best if it's as fast as the best move, or a disc off it (core `nearBest`).
  const fastest = before.kind === "win" ? before.discs : 0;
  const count = countOf(answer);
  if (fastest > 0 && count === fastest) return "best";
  return fastest > SURE_DISCS && count === fastest + 1 ? "best" : "keeps";
}
