/**
 * The Stockfish side of chess's `ChessAgent`: each strategy id in the chess
 * and bughouse manifests becomes UCI options plus a search limit, run on the
 * engine pool (`chess-engine-pool.ts`). The machine falls back to its
 * built-in search when this rejects.
 *
 * Strength ladder: Stockfish's `UCI_LimitStrength` + `UCI_Elo` (1320–3190)
 * for the rated tiers, `Skill Level 0` at depth 1 below that, full strength
 * on top. Every tier also respects its own clock: it never plans to spend
 * more than a slice of the time it has left.
 */

import type { AgentClock, ChessAgent, ChessAgentRequest } from "@boardgames/core/games/chess/agent";
import { type EnginePool, enginePool, type SearchRequest } from "./chess-engine-pool.ts";

interface Tier {
  readonly options: readonly (readonly [string, string])[];
  /** Think time when untimed (ms), or a fixed `go` limit. */
  readonly thinkMs: number;
  readonly go?: string;
}

const UNLIMITED: readonly (readonly [string, string])[] = [
  ["UCI_LimitStrength", "false"],
  ["Skill Level", "20"],
];
const elo = (n: number): readonly (readonly [string, string])[] => [
  ["Skill Level", "20"],
  ["UCI_LimitStrength", "true"],
  ["UCI_Elo", String(n)],
];

const TIERS: Readonly<Record<string, Tier>> = {
  "sf-beginner": {
    options: [
      ["UCI_LimitStrength", "false"],
      ["Skill Level", "0"],
    ],
    thinkMs: 100,
    go: "depth 1",
  },
  "sf-1400": { options: elo(1400), thinkMs: 300 },
  "sf-1800": { options: elo(1800), thinkMs: 400 },
  "sf-2200": { options: elo(2200), thinkMs: 600 },
  "sf-2700": { options: elo(2700), thinkMs: 800 },
  "sf-max": { options: UNLIMITED, thinkMs: 1_500 },
  "fairy-easy": {
    options: [["Skill Level", "0"]],
    thinkMs: 100,
    go: "depth 1",
  },
  "fairy-medium": { options: [["Skill Level", "8"]], thinkMs: 300 },
  "fairy-max": { options: [["Skill Level", "20"]], thinkMs: 800 },
};

/**
 * How long to think, given the tier's preference and the clock. A timed game
 * spends at most ~1/30 of what's left plus most of the increment, so an AI
 * never flags in a long game; bughouse is faster still.
 */
export function thinkTime(
  tier: Tier,
  clock: AgentClock | null,
  mover: "w" | "b",
  variant: string,
): number {
  if (!clock) return tier.thinkMs;
  const left = clock[mover];
  const share = variant === "bughouse" ? 45 : 30;
  const budget = left / share + clock.inc * 0.8;
  return Math.max(30, Math.min(tier.thinkMs, Math.floor(budget), Math.floor(left / 4)));
}

/** The pool request for one decision. Exported for tests. */
export function searchRequest(req: ChessAgentRequest): SearchRequest {
  const tier = TIERS[req.strategy];
  if (!tier) throw new Error(`no engine tier for strategy "${req.strategy}"`);
  const mover = req.fen.split(" ")[1] === "b" ? "b" : "w";
  const ms = thinkTime(tier, req.clock, mover, req.variant);
  // Bughouse pockets change between moves outside this board's history, so the
  // engine gets the current FEN; classical chess sends the whole game so
  // Stockfish sees repetitions.
  const position =
    req.variant === "bughouse" || req.moves.length === 0
      ? `fen ${req.variant === "bughouse" ? req.fen : req.startFen}`
      : `fen ${req.startFen} moves ${req.moves.join(" ")}`;
  return { options: tier.options, position, go: tier.go ?? `movetime ${ms}`, budgetMs: ms };
}

/** Untimed games feel better when the AI doesn't answer instantly. */
const MIN_UNTIMED_REPLY_MS = 400;

export function engineAgent(variant: "chess" | "bughouse"): ChessAgent | null {
  const pool: EnginePool | null = enginePool(variant);
  if (!pool) return null;
  return {
    async bestMove(req) {
      const started = Date.now();
      const uci = await pool.search(searchRequest(req));
      if (!req.clock) {
        const wait = MIN_UNTIMED_REPLY_MS - (Date.now() - started);
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      }
      return uci;
    },
  };
}
