/**
 * Chess in the local tournament runner: the game's own machine, every seat an
 * AI, with its Stockfish tiers played by the server's own engine pool and tier
 * table (`server/src/games/chess-engine-pool.ts`, `chess-agent.ts` —
 * `searchRequest` maps a strategy id to UCI options and a think time), loaded
 * at run time so core never depends on the server package. `random` plays the
 * machine's built-in move, as on the server.
 *
 * Untimed games: a clock would make the result depend on how loaded the
 * machine running the tournament is. Each tier still thinks its own untimed
 * budget (100 ms … 1.5 s a move), so a game with `sf-max` takes a minute or
 * two — narrow a run with `--strategies`:
 *
 *   pnpm --filter @boardgames/core tournament chess --games 20 --workers 3 \
 *     --strategies random,sf-beginner,sf-1400,sf-1800
 *
 * Unlike the server, an engine failure is not covered by the built-in search:
 * a "Stockfish" seat that played the fallback would make the results a lie, so
 * the game fails and the runner writes nothing.
 */

import type { GameOutcome } from "../../machines/outcome";
import { playMachineToEnd } from "../../tournament/drive-machine";
import { importServerModule, isRecord } from "../../tournament/server-module";
import type { TournamentSimulator } from "../../tournament/simulator";
import type { ChessAgent, ChessAgentRequest } from "./agent";
import { chessSpec, withChessAgent } from "./machine";
import { chessManifest } from "./manifest";

/** A whole game, every engine move included. */
export const GAME_TIMEOUT_MS = 30 * 60_000;

const engines = new Map<"chess" | "bughouse", Promise<ChessAgent>>();

/**
 * The server's engine for a variant, as a `ChessAgent` — without the server's
 * cosmetic minimum reply time. One engine process per worker: the runner plays
 * one game at a time, so a second would sit idle (and Fairy-Stockfish holds
 * ~360 MB). Override with CHESS_AI_ENGINES / BUGHOUSE_AI_ENGINES.
 */
export function serverEngineAgent(variant: "chess" | "bughouse"): Promise<ChessAgent> {
  let agent = engines.get(variant);
  if (!agent) {
    agent = (async () => {
      process.env.CHESS_AI_ENGINES ??= "1";
      process.env.BUGHOUSE_AI_ENGINES ??= "1";
      const poolMod = await importServerModule("games/chess-engine-pool.ts");
      const agentMod = await importServerModule("games/chess-agent.ts");
      const { enginePool } = poolMod;
      const { searchRequest } = agentMod;
      if (typeof enginePool !== "function" || typeof searchRequest !== "function") {
        throw new Error("server chess engine modules changed shape");
      }
      const pool: unknown = enginePool(variant);
      if (!isRecord(pool) || typeof pool.search !== "function") {
        throw new Error(`no ${variant} engine installed (or *_AI_ENGINES=0)`);
      }
      const search = pool.search;
      return {
        async bestMove(request: ChessAgentRequest): Promise<string> {
          const uci: unknown = await search.call(pool, searchRequest(request));
          if (typeof uci !== "string") throw new Error("engine returned no move");
          return uci;
        },
      };
    })();
    engines.set(variant, agent);
  }
  return agent;
}

/**
 * `agent`, except that a failure aborts the game — the machine would otherwise
 * quietly play its built-in move. One retry first: the pool respawns an engine
 * that hung (a loaded laptop can stall one past its slack), and asking again
 * is the same decision, not a different player.
 */
export function strictAgent(agent: ChessAgent, abort: AbortController): ChessAgent {
  return {
    async bestMove(request) {
      try {
        return await agent.bestMove(request);
      } catch {
        try {
          return await agent.bestMove(request);
        } catch (err) {
          abort.abort(err);
          throw err;
        }
      }
    },
  };
}

const CONFIG = chessManifest.config.parse({ timeControl: null });

export const chessSimulator: TournamentSimulator<Promise<GameOutcome>> = {
  playerCounts: [2],

  async simulate({ strategies, seed }) {
    const abort = new AbortController();
    const engine = strategies.some((s) => s.startsWith("sf-"))
      ? strictAgent(await serverEngineAgent("chess"), abort)
      : null;
    const machine = engine ? withChessAgent(engine) : chessSpec.machine;
    return playMachineToEnd(
      chessSpec,
      machine.provide({ delays: { aiRetry: 0 } }),
      { strategies, seed, config: CONFIG, timeoutMs: GAME_TIMEOUT_MS },
      { signal: abort.signal },
    );
  },
};
