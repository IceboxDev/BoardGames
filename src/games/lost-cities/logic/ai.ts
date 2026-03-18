import type { AIMove, GameState } from "./types";

export type { AIMove };

let worker: Worker | null = null;

function getAIWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./ai-worker.ts", import.meta.url), { type: "module" });
  }
  return worker;
}

export function computeAIMove(state: GameState): Promise<AIMove> {
  return new Promise((resolve) => {
    const w = getAIWorker();
    const handler = (e: MessageEvent<AIMove>) => {
      w.removeEventListener("message", handler);
      resolve(e.data);
    };
    w.addEventListener("message", handler);
    w.postMessage(state);
  });
}

export function terminateAIWorker(): void {
  worker?.terminate();
  worker = null;
}
