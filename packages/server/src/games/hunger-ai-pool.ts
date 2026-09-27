/**
 * Worker-thread pool for The Hunger's search bots. A search thinks for about a
 * second per decision; on the main thread that would freeze every session on
 * the server, so decisions are posted to a small pool and the machine awaits
 * them. The registry binds the pool into each session's machine
 * (`withHungerAiOffload`). A missing worker file, a crash or a timeout
 * rejects, and core then plays Nosferatu's move for that decision.
 *
 * Threads start on the first search decision, so sessions with no search seat
 * (and tests) never spawn any.
 *
 * Env: HUNGER_AI_WORKERS (pool size, 0 disables), HUNGER_AI_THINK_MS (per
 * decision, read by the worker).
 */
import { existsSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import type { AiOffload } from "@boardgames/core/games/the-hunger/ai-strategies";
import type { Action, GameState } from "@boardgames/core/games/the-hunger/types";

const TIMEOUT_MS = 15_000;
/** Crashes tolerated before the pool gives up and search bots fall back for good. */
const MAX_RESPAWNS = 5;

interface Pending {
  resolve: (a: Action) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
}

interface Slot {
  worker: Worker;
  busy: boolean;
  pending: Map<number, Pending>;
}

function resolveWorker(): { path: string; isDev: boolean } | null {
  // Dev (tsx): sibling .ts. Prod (tsup): emitted at dist/games/hunger-ai-worker.js.
  const sibling = join(import.meta.dirname, "hunger-ai-worker.ts");
  if (existsSync(sibling)) return { path: sibling, isDev: true };
  const built = join(import.meta.dirname, "games", "hunger-ai-worker.js");
  return existsSync(built) ? { path: built, isDev: false } : null;
}

function createPool(size: number, file: { path: string; isDev: boolean }): AiOffload {
  let nextId = 1;
  const queue: { id: number; state: GameState; p: Pending }[] = [];
  const slots: Slot[] = [];
  let respawns = 0;
  let failed: Error | null = null;

  const newWorker = (): Worker => {
    if (!file.isDev) return new Worker(file.path);
    // tsx's `--import` hook does not reach worker threads; register it inside.
    const target = JSON.stringify(pathToFileURL(file.path).href);
    return new Worker(
      `import("tsx/esm/api").then((m) => { m.register(); return import(${target}); });`,
      { eval: true },
    );
  };

  const drain = () => {
    for (const slot of slots) {
      if (slot.busy || queue.length === 0) continue;
      const job = queue.shift();
      if (!job) return;
      slot.busy = true;
      slot.pending.set(job.id, job.p);
      slot.worker.postMessage({ id: job.id, state: job.state });
    }
  };

  const spawn = (): Slot => {
    const worker = newWorker();
    const slot: Slot = { worker, busy: false, pending: new Map() };
    worker.unref();
    worker.on("message", (msg: { id: number; action?: Action; error?: string }) => {
      const p = slot.pending.get(msg.id);
      if (!p) return;
      slot.pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.action) p.resolve(msg.action);
      else p.reject(new Error(msg.error ?? "no action"));
      slot.busy = false;
      drain();
    });
    const fail = (err: Error) => {
      for (const p of slot.pending.values()) {
        clearTimeout(p.timer);
        p.reject(err);
      }
      slot.pending.clear();
      const idx = slots.indexOf(slot);
      if (idx === -1) return;
      if (++respawns > MAX_RESPAWNS) {
        slots.splice(idx, 1);
        if (slots.length === 0) {
          failed = err;
          for (const job of queue.splice(0)) job.p.reject(err);
          console.error(
            "[the-hunger] AI worker pool failed; search bots play Nosferatu's moves",
            err,
          );
        }
        return;
      }
      // Replace the dead worker so the pool keeps its size.
      slots[idx] = spawn();
      drain();
    };
    worker.on("error", fail);
    worker.on("exit", (code) => {
      if (code !== 0) fail(new Error(`worker exited ${code}`));
    });
    return slot;
  };

  let started = false;
  return (state) =>
    new Promise<Action>((resolve, reject) => {
      if (failed) {
        reject(failed);
        return;
      }
      if (!started) {
        started = true;
        for (let i = 0; i < size; i++) slots.push(spawn());
        console.log(`[the-hunger] AI worker pool: ${size} thread(s)`);
      }
      const id = nextId++;
      const timer = setTimeout(() => {
        const idx = queue.findIndex((j) => j.id === id);
        if (idx !== -1) queue.splice(idx, 1);
        for (const slot of slots) slot.pending.delete(id);
        reject(new Error("AI decision timed out"));
      }, TIMEOUT_MS);
      queue.push({ id, state, p: { resolve, reject, timer } });
      drain();
    });
}

let resolved: AiOffload | null | undefined;

/**
 * The shared pool every Hunger session's search seats think on, or `null`
 * when it is disabled or the worker file is missing (search seats then play
 * Nosferatu's moves).
 */
export function hungerAiOffload(): AiOffload | null {
  if (resolved !== undefined) return resolved;
  const size = Number(
    process.env.HUNGER_AI_WORKERS ?? Math.max(1, Math.min(4, availableParallelism() - 1)),
  );
  const file = resolveWorker();
  if (size <= 0 || !file) {
    console.warn("[the-hunger] AI worker pool disabled; search bots play Nosferatu's moves");
    resolved = null;
  } else {
    resolved = createPool(size, file);
  }
  return resolved;
}
