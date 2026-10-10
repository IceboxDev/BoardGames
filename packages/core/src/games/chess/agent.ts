/**
 * Where an AI move comes from. The machine asks a `ChessAgent`; by default
 * that is the built-in search (`fallback-ai.ts`), and the server swaps in
 * Stockfish per session with `withChessAgent` — the same seam 7 Wonders and
 * Decrypto use for their external engines.
 */

import { createRng } from "../../lib/rng";
import { parseFen } from "./engine/fen";
import { moveToUci } from "./engine/uci";
import { fallbackMove } from "./fallback-ai";

export interface AgentClock {
  /** Remaining time per side (ms) and the increment, at the moment of asking. */
  readonly w: number;
  readonly b: number;
  readonly inc: number;
}

export interface ChessAgentRequest {
  /** `chess` or `bughouse` — which rules the engine must play. */
  readonly variant: "chess" | "bughouse";
  /** The game's start position, plus the moves since — engines need the history for repetition. */
  readonly startFen: string;
  readonly moves: readonly string[];
  /** The position to move in (equal to start + moves; bughouse sends pockets here). */
  readonly fen: string;
  readonly strategy: string;
  readonly clock: AgentClock | null;
  /** Varies the built-in AI's tie-breaks deterministically per game and ply. */
  readonly seed: number;
}

export interface ChessAgent {
  /** The chosen move as UCI. May reject; the machine then plays the built-in move. */
  bestMove(request: ChessAgentRequest): Promise<string>;
}

/** The built-in search's settings per strategy id (unknown ids play at depth 2). */
const FALLBACK_DEPTH: Readonly<Record<string, { depth: number; noise: number }>> = {
  random: { depth: 0, noise: 0 },
  "sf-beginner": { depth: 1, noise: 120 },
  "sf-1400": { depth: 2, noise: 40 },
  "fairy-easy": { depth: 1, noise: 120 },
  "fairy-medium": { depth: 2, noise: 30 },
};

/** The built-in move, synchronously — also the fallback when an agent fails. */
export function builtInMove(request: ChessAgentRequest): string {
  const pos = parseFen(request.fen, { bughouse: request.variant === "bughouse" });
  const settings = FALLBACK_DEPTH[request.strategy] ?? { depth: 2, noise: 0 };
  const rng = createRng((request.seed ^ Math.imul(request.moves.length + 1, 0x9e3779b1)) | 0);
  const move = fallbackMove(pos, { ...settings, rng, maxNodes: 40_000 });
  if (!move) throw new Error("no legal move");
  return moveToUci(move);
}

export const builtInAgent: ChessAgent = {
  bestMove: async (request) => builtInMove(request),
};

/** Strategies the built-in search plays even when an external engine is bound. */
export const BUILT_IN_STRATEGIES: ReadonlySet<string> = new Set(["random"]);
