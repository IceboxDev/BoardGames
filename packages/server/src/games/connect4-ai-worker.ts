// A worker thread for Connect 4's heavy bots (see connect4-ai-pool.ts): one
// decision per message, its search kept off the event loop. Each thread keeps
// its own solver tables warm between decisions, and loads the opening books
// once at start (Perfect answers the whole 7×6 opening from them).
import { parentPort } from "node:worker_threads";
import { pickAiAction } from "@boardgames/core/games/connect-4/ai-strategies";
import { getLegalActions } from "@boardgames/core/games/connect-4/rules";
import { loadOpeningBooks } from "@boardgames/core/games/connect-4/solver/book";
import type { GameState } from "@boardgames/core/games/connect-4/types";

const booksReady = loadOpeningBooks().catch((err: unknown) => {
  // Without a book the solver still plays — it just searches the opening.
  console.warn("[connect-4] opening books failed to load:", err);
});

parentPort?.on("message", async (msg: { id: number; job: GameState }) => {
  await booksReady;
  try {
    const state = msg.job;
    const result = pickAiAction(state, getLegalActions(state, state.currentPlayer));
    parentPort?.postMessage({ id: msg.id, result });
  } catch (err) {
    parentPort?.postMessage({
      id: msg.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});
