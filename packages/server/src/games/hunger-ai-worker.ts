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
// Lilith thinks 1.5× Dracula's time per decision: each plan is played out twice (Nosferatu and her
// plan), and she follows a chosen plan without re-searching, so her turns stay short.
configureLilith({
  timeMs: Number(process.env.HUNGER_LILITH_THINK_MS ?? Math.round(1.5 * LIVE_THINK_MS)),
});

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
