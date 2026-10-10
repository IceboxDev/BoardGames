/**
 * Worker threads for Connect 4's Deep Search and Perfect seats, which can
 * think for seconds (`connect4-ai-worker.ts`). A missing worker file, a crash
 * or a timeout rejects, and the machine plays Lookahead's move instead.
 *
 * Env: CONNECT4_AI_WORKERS (pool size, default 2; 0 disables).
 */
import type { AiOffload } from "@boardgames/core/games/connect-4/ai-strategies";
import { loadOpeningBooks } from "@boardgames/core/games/connect-4/solver/book";
import type { Action, GameState } from "@boardgames/core/games/connect-4/types";
import { createWorkerPool, resolveWorkerFile } from "./worker-pool.ts";

let resolved: AiOffload | null | undefined;

export function connect4AiOffload(): AiOffload | null {
  if (resolved !== undefined) return resolved;
  const size = Number(process.env.CONNECT4_AI_WORKERS ?? 2);
  const file = resolveWorkerFile("connect4-ai-worker");
  if (size <= 0 || !file) {
    console.warn("[connect-4] AI worker pool disabled; heavy bots think inline");
    // Inline Perfect reads the books once they are in (until then it searches).
    void loadOpeningBooks();
    resolved = null;
  } else {
    resolved = createWorkerPool<GameState, Action>({
      label: "connect-4",
      file,
      size,
      timeoutMs: 20_000,
    });
  }
  return resolved;
}
