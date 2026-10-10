/**
 * What the Go machine asks of an AI, and the in-thread defaults. The server
 * binds stronger services per session (`withGoAi`): the worker pool for the
 * TS bots, KataGo for the `katago-*` tiers and the dead-stone proposal.
 */

import { estimateDeadStones } from "../estimate";
import type { GoStrategy } from "../manifest";
import type { GoGame } from "../types";
import { chooseTsMove } from "./choose";

export interface GoMoveRequest {
  readonly game: GoGame;
  readonly strategy: GoStrategy;
  /** Thinking budget for this move. */
  readonly timeMs: number;
  readonly seed: number;
}

export interface GoMoveReply {
  /** A point, or `null` to pass. */
  readonly point: number | null;
  /** Played by a fallback because the requested engine was unavailable. */
  readonly degraded?: boolean;
}

export interface GoAiServices {
  chooseMove(req: GoMoveRequest): Promise<GoMoveReply>;
  /** The stones to propose as dead once both sides have passed. */
  deadStones(game: GoGame): Promise<readonly number[]>;
}

/** Search budget per strategy and board size, before any clock cap. */
export function thinkBudgetMs(strategy: GoStrategy, size: number): number {
  if (strategy === "heuristic") return 0;
  if (strategy === "mcts") return size <= 9 ? 1500 : size <= 13 ? 2000 : 2500;
  return 4000;
}

/** Playouts for the Monte Carlo ownership estimate. */
export function estimatePlayouts(size: number): number {
  return size <= 9 ? 800 : size <= 13 ? 500 : 300;
}

/**
 * Everything in-thread: what core tests and a server without a pool or KataGo
 * run. KataGo tiers fall back to a short MCTS and say so.
 */
export const inThreadGoAi: GoAiServices = {
  async chooseMove(req) {
    const katago = req.strategy.startsWith("katago");
    const bot = req.strategy === "heuristic" ? "heuristic" : "mcts";
    const point = chooseTsMove(req.game, bot, {
      timeMs: Math.min(req.timeMs, 400),
      seed: req.seed,
    });
    return { point, degraded: katago };
  },
  async deadStones(game) {
    return estimateDeadStones(game, estimatePlayouts(game.size));
  },
};
