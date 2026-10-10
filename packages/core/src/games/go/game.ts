/**
 * Game-level transitions: stones, passes, positional superko, undo. Pure — every
 * function returns a new `GoGame`.
 */

import { neighbors, placeStone } from "./board";
import { handicapPoints, handicapProblem } from "./handicap";
import {
  type Cell,
  type Color,
  EMPTY,
  type GoGame,
  type GoRules,
  IllegalMove,
  other,
} from "./types";
import { boardHalves, hashBoard, hashKey, ZOBRIST_HI, ZOBRIST_LO } from "./zobrist";

export function newGame(rules: GoRules): GoGame {
  const problem = handicapProblem(rules.size, rules.handicap);
  if (problem) throw new Error(problem);
  const handicapStones = handicapPoints(rules.size, rules.handicap);
  const board = new Array<Cell>(rules.size * rules.size).fill(EMPTY);
  for (const p of handicapStones) board[p] = 1;
  return {
    size: rules.size,
    komi: rules.komi,
    handicap: rules.handicap,
    handicapStones,
    board,
    toMove: handicapStones.length > 0 ? 1 : 0,
    captures: [0, 0],
    consecutivePasses: 0,
    history: [hashBoard(board)],
    moves: [],
  };
}

/** The game after the side to move puts a stone on `point`. Throws `IllegalMove`. */
export function playStone(game: GoGame, point: number): GoGame {
  const color = game.toMove;
  const { board, captured } = placeStone(game.board, game.size, point, color);
  const key = hashBoard(board);
  if (game.history.includes(key)) throw new IllegalMove("superko", point);
  const captures: [number, number] = [game.captures[0], game.captures[1]];
  captures[color] += captured.length;
  return {
    ...game,
    board,
    toMove: other(color),
    captures,
    consecutivePasses: 0,
    history: [...game.history, key],
    moves: [...game.moves, { color, point, captured }],
  };
}

export function pass(game: GoGame): GoGame {
  return {
    ...game,
    toMove: other(game.toMove),
    consecutivePasses: game.consecutivePasses + 1,
    moves: [...game.moves, { color: game.toMove, point: null, captured: [] }],
  };
}

/** A stone at `point`, or a pass for `null`. */
export function play(game: GoGame, point: number | null): GoGame {
  return point === null ? pass(game) : playStone(game, point);
}

/** Every point the side to move may play (passing is always legal too). */
export function legalPoints(game: GoGame): number[] {
  const seen = new Set(game.history);
  const out: number[] = [];
  const adj = neighbors(game.size);
  const { hi, lo } = boardHalves(game.board);
  const offset = game.toMove; // stone value - 1
  for (let p = 0; p < game.board.length; p++) {
    if (game.board[p] !== EMPTY) continue;
    // With an empty neighbour the stone can neither be suicide nor capture,
    // so the new position is this one plus the stone: hash it incrementally.
    // It still has to clear superko — a cycle can close on a quiet move.
    if ((adj[p] ?? []).some((q) => game.board[q] === EMPTY)) {
      const i = p * 2 + offset;
      const key = hashKey(hi ^ (ZOBRIST_HI[i] ?? 0), lo ^ (ZOBRIST_LO[i] ?? 0));
      if (!seen.has(key)) out.push(p);
      continue;
    }
    try {
      const { board } = placeStone(game.board, game.size, p, game.toMove);
      if (!seen.has(hashBoard(board))) out.push(p);
    } catch {
      // occupied/suicide — not legal
    }
  }
  return out;
}

export function isLegal(game: GoGame, point: number | null): boolean {
  if (point === null) return true;
  try {
    playStone(game, point);
    return true;
  } catch {
    return false;
  }
}

/** Replay `points` from the start of a game with these rules. */
export function replay(rules: GoRules, points: readonly (number | null)[]): GoGame {
  let game = newGame(rules);
  for (const p of points) game = play(game, p);
  return game;
}

/** The game as it was after its first `moveCount` moves. */
export function rewind(game: GoGame, moveCount: number): GoGame {
  return replay(
    game,
    game.moves.slice(0, Math.max(0, moveCount)).map((m) => m.point),
  );
}

/**
 * The point the side to move may not retake right now (a simple ko), for the
 * board marker. Superko covers the longer cycles.
 */
export function koPoint(game: GoGame): number | null {
  const last = game.moves.at(-1);
  if (!last || last.point === null || last.captured.length !== 1) return null;
  const retake = last.captured[0] as number;
  const stone = last.point;
  const adj = neighbors(game.size)[stone] ?? [];
  // The capturing stone stands alone with exactly one liberty: the captured point.
  const lonely = adj.every((q) => game.board[q] !== game.board[stone]);
  const libs = adj.filter((q) => game.board[q] === EMPTY);
  if (!lonely || libs.length !== 1 || libs[0] !== retake) return null;
  return legalPoints(game).includes(retake) ? null : retake;
}

export function lastStone(game: GoGame): { point: number; color: Color } | null {
  const last = game.moves.at(-1);
  return last && last.point !== null ? { point: last.point, color: last.color } : null;
}
