// A worker thread for Go's TypeScript bots and the Monte Carlo dead-stone
// estimate (see go-ai.ts): one job per message, kept off the event loop.
import { parentPort } from "node:worker_threads";
import { chooseTsMove } from "@boardgames/core/games/go/ai/choose";
import { estimatePlayouts } from "@boardgames/core/games/go/ai/services";
import { estimateDeadStones } from "@boardgames/core/games/go/estimate";
import type { GoAiJob } from "./go-ai.ts";

parentPort?.on("message", (msg: { id: number; job: GoAiJob }) => {
  try {
    const { job } = msg;
    const result =
      job.kind === "move"
        ? {
            point: chooseTsMove(job.game, job.bot, { timeMs: job.timeMs, seed: job.seed }),
          }
        : { dead: estimateDeadStones(job.game, estimatePlayouts(job.game.size)) };
    parentPort?.postMessage({ id: msg.id, result });
  } catch (err) {
    parentPort?.postMessage({
      id: msg.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});
