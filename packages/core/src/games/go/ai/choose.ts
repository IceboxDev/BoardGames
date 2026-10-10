/**
 * The TypeScript bots' entry point: a game in, a game point (or pass) out. The
 * move is always one `legalPoints` lists — the fast board only knows simple
 * ko, so its candidates are filtered by the game's superko-aware list.
 */

import { createRng } from "../../../lib/rng";
import { FastBoard } from "../fast/fast-board";
import { legalPoints } from "../game";
import { handicapBonus } from "../scoring";
import type { GoGame } from "../types";
import { heuristicMove } from "./heuristic";
import { mctsMove } from "./mcts";

export type TsBot = "heuristic" | "mcts";

export interface TsBotOptions {
  readonly timeMs: number;
  readonly seed: number;
}

/** A point to play, or `null` to pass. */
export function chooseTsMove(game: GoGame, bot: TsBot, opts: TsBotOptions): number | null {
  const fb = FastBoard.fromGame(game);
  const rng = createRng(opts.seed);
  const allowed = new Set(legalPoints(game).map((p) => fb.pad(p)));
  if (allowed.size === 0) return null;
  let move: number;
  if (bot === "heuristic") {
    // Pebble answers a pass with a pass once the board is mostly settled.
    const last = game.moves.at(-1);
    const filled = game.board.filter((c) => c !== 0).length / game.board.length;
    if (last && last.point === null && filled > 0.45) return null;
    move = heuristicMove(fb, rng, allowed);
  } else {
    move = mctsMove(fb, rng, {
      timeMs: opts.timeMs,
      bonus: game.komi + handicapBonus(game.handicap),
      allowed,
    }).move;
  }
  if (move < 0 || !allowed.has(move)) return move < 0 ? null : fb.unpad([...allowed][0] as number);
  return fb.unpad(move);
}
