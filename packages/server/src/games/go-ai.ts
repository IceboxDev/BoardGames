/**
 * Go's AI services on the server (`withGoAi` binds them per session):
 *
 *   - Brook's MCTS and the Monte Carlo dead-stone estimate run on a worker
 *     pool (`go-ai-worker.ts`), so a 2-second search never blocks the
 *     event loop for every other session;
 *   - the `katago-*` tiers and the dead-stone proposal go to KataGo when it is
 *     configured (`katago/client.ts`), falling back to the pool's MCTS — and
 *     saying so (`degraded`) — when it isn't or it fails.
 *
 * Env: GO_AI_WORKERS (pool size, default 2; 0 = think inline).
 */

import type { TsBot } from "@boardgames/core/games/go/ai/choose";
import {
  type GoAiServices,
  type GoMoveReply,
  type GoMoveRequest,
  inThreadGoAi,
} from "@boardgames/core/games/go/ai/services";
import type { GoGame } from "@boardgames/core/games/go/types";
import { type KataGoMover, kataGoMover } from "../katago/go-agent.ts";
import { createWorkerPool, resolveWorkerFile } from "./worker-pool.ts";

export type GoAiJob =
  | { kind: "move"; game: GoGame; bot: TsBot; timeMs: number; seed: number }
  | { kind: "dead"; game: GoGame };

type GoAiResult = { point: number | null } | { dead: number[] };

type Pool = (job: GoAiJob) => Promise<GoAiResult>;

let pool: Pool | null | undefined;

function goPool(): Pool | null {
  if (pool !== undefined) return pool;
  const size = Number(process.env.GO_AI_WORKERS ?? 2);
  const file = resolveWorkerFile("go-ai-worker");
  if (size <= 0 || !file) {
    console.warn("[go] AI worker pool disabled; bots think inline");
    pool = null;
  } else {
    pool = createWorkerPool<GoAiJob, GoAiResult>({ label: "go", file, size, timeoutMs: 20_000 });
  }
  return pool;
}

async function tsMove(req: GoMoveRequest, bot: TsBot, degraded: boolean): Promise<GoMoveReply> {
  const p = goPool();
  if (p) {
    try {
      const r = await p({ kind: "move", game: req.game, bot, timeMs: req.timeMs, seed: req.seed });
      if ("point" in r) return { point: r.point, degraded };
    } catch (err) {
      console.warn("[go] pool move failed; thinking inline", err);
    }
  }
  const inline = await inThreadGoAi.chooseMove({ ...req, strategy: bot });
  return { point: inline.point, degraded };
}

export function createGoServerAi(katago: KataGoMover | null): GoAiServices {
  return {
    async chooseMove(req) {
      // Pebble decides in a few milliseconds: no thread needed.
      if (req.strategy === "heuristic") return inThreadGoAi.chooseMove(req);
      if (req.strategy === "mcts") return tsMove(req, "mcts", false);
      if (katago) {
        try {
          return { point: await katago.move(req) };
        } catch (err) {
          console.warn(`[go] KataGo move failed (${req.strategy}); MCTS stands in`, err);
        }
      }
      return tsMove(req, "mcts", true);
    },
    async deadStones(game) {
      if (katago) {
        try {
          return await katago.deadStones(game);
        } catch (err) {
          console.warn("[go] KataGo ownership failed; estimating", err);
        }
      }
      const p = goPool();
      if (p) {
        try {
          const r = await p({ kind: "dead", game });
          if ("dead" in r) return r.dead;
        } catch (err) {
          console.warn("[go] pool estimate failed; estimating inline", err);
        }
      }
      return inThreadGoAi.deadStones(game);
    },
  };
}

let services: GoAiServices | undefined;

/** The services every Go session shares. */
export function goServerAi(): GoAiServices {
  services ??= createGoServerAi(kataGoMover());
  return services;
}
