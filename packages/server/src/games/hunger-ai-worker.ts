// A worker thread for The Hunger's search bots (see hunger-ai-pool.ts). Each
// message is one decision; the search runs here, off the event loop.
import { parentPort } from "node:worker_threads";
import {
  configureDracula,
  configureLilith,
  configureStrigoi,
  pickAiAction,
} from "@boardgames/core/games/the-hunger/ai-strategies";
import type { GameState } from "@boardgames/core/games/the-hunger/types";

const LIVE_THINK_MS = Number(process.env.HUNGER_AI_THINK_MS ?? 1200);
configureStrigoi({ timeMs: LIVE_THINK_MS });
configureDracula({ timeMs: LIVE_THINK_MS });
// Lilith gets Dracula's per-decision time (she follows her chosen plan without re-searching).
configureLilith({ timeMs: Number(process.env.HUNGER_LILITH_THINK_MS ?? LIVE_THINK_MS) });

parentPort?.on("message", (msg: { id: number; state: GameState }) => {
  try {
    parentPort?.postMessage({ id: msg.id, action: pickAiAction(msg.state) });
  } catch (err) {
    parentPort?.postMessage({
      id: msg.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});
