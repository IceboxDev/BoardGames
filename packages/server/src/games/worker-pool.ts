/**
 * A small worker-thread pool for AI decisions that would block the event loop:
 * one job per message, queued while every thread is busy, a timeout per job,
 * and crashed threads respawned (up to a limit, after which every job
 * rejects and the caller falls back). Threads start on the first job, so
 * tests and sessions that never need one spawn nothing.
 *
 * The worker answers `{ id, result }` or `{ id, error }` for each `{ id, job }`.
 * (The Hunger's pool, `hunger-ai-pool.ts`, predates this and is the same shape.)
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";

const MAX_RESPAWNS = 5;

interface Pending<TResult> {
  resolve: (r: TResult) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
}

interface Slot<TResult> {
  worker: Worker;
  busy: boolean;
  pending: Map<number, Pending<TResult>>;
}

export interface WorkerFile {
  path: string;
  isDev: boolean;
}

/** Dev (tsx): the sibling `<name>.ts`. Prod (tsup): `dist/games/<name>.js`. */
export function resolveWorkerFile(name: string): WorkerFile | null {
  const sibling = join(import.meta.dirname, `${name}.ts`);
  if (existsSync(sibling)) return { path: sibling, isDev: true };
  const built = join(import.meta.dirname, "games", `${name}.js`);
  return existsSync(built) ? { path: built, isDev: false } : null;
}

export function createWorkerPool<TJob, TResult>(options: {
  label: string;
  file: WorkerFile;
  size: number;
  timeoutMs: number;
}): (job: TJob) => Promise<TResult> {
  const { label, file, size, timeoutMs } = options;
  let nextId = 1;
  const queue: { id: number; job: TJob; p: Pending<TResult> }[] = [];
  const slots: Slot<TResult>[] = [];
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
      const next = queue.shift();
      if (!next) return;
      slot.busy = true;
      slot.pending.set(next.id, next.p);
      slot.worker.postMessage({ id: next.id, job: next.job });
    }
  };

  const spawn = (): Slot<TResult> => {
    const worker = newWorker();
    const slot: Slot<TResult> = { worker, busy: false, pending: new Map() };
    worker.unref();
    worker.on("message", (msg: { id: number; result?: TResult; error?: string }) => {
      const p = slot.pending.get(msg.id);
      slot.busy = false;
      if (p) {
        slot.pending.delete(msg.id);
        clearTimeout(p.timer);
        if (msg.result !== undefined) p.resolve(msg.result);
        else p.reject(new Error(msg.error ?? "no result"));
      }
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
          for (const queued of queue.splice(0)) queued.p.reject(err);
          console.error(`[${label}] AI worker pool failed; falling back inline`, err);
        }
        return;
      }
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
  return (job) =>
    new Promise<TResult>((resolve, reject) => {
      if (failed) {
        reject(failed);
        return;
      }
      if (!started) {
        started = true;
        for (let i = 0; i < size; i++) slots.push(spawn());
        console.log(`[${label}] AI worker pool: ${size} thread(s)`);
      }
      const id = nextId++;
      const timer = setTimeout(() => {
        const idx = queue.findIndex((q) => q.id === id);
        if (idx !== -1) queue.splice(idx, 1);
        // A timed-out job may still be running; its slot frees when it answers.
        for (const slot of slots) slot.pending.delete(id);
        reject(new Error("AI decision timed out"));
      }, timeoutMs);
      queue.push({ id, job, p: { resolve, reject, timer } });
      drain();
    });
}
