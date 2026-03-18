import type { Action, GameState } from "./types";

export interface AIMove {
  action: Action;
}

let worker: Worker | null = null;

function getAIWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./ai-worker.ts", import.meta.url), { type: "module" });
  }
  return worker;
}

export function computeAIAction(state: GameState, playerIndex: number): Promise<AIMove> {
  return new Promise((resolve) => {
    const w = getAIWorker();
    const handler = (e: MessageEvent<AIMove>) => {
      w.removeEventListener("message", handler);
      resolve(e.data);
    };
    w.addEventListener("message", handler);
    w.postMessage({ state, playerIndex });
  });
}

export function terminateAIWorker(): void {
  worker?.terminate();
  worker = null;
}
