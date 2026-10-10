/**
 * KataGo's analysis engine as one long-lived child process: JSON queries in on
 * stdin, one JSON line per analysed turn out on stdout, matched by id. It
 * restarts with a backoff when it dies, and gives up after a burst of crashes.
 */
import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import {
  type KataGoEngine,
  type KataGoQuery,
  type KataGoResponse,
  KataGoResponseSchema,
} from "./protocol.ts";

const MAX_CRASHES = 5;
const CRASH_WINDOW_MS = 10 * 60_000;

interface Pending {
  readonly turns: number;
  readonly got: KataGoResponse[];
  readonly resolve: (r: KataGoResponse[]) => void;
  readonly reject: (e: Error) => void;
  readonly timer: NodeJS.Timeout;
}

export interface ChildEngineOptions {
  readonly bin: string;
  readonly model: string;
  readonly humanModel?: string;
  readonly config: string;
}

export function createChildEngine(opts: ChildEngineOptions): KataGoEngine {
  let proc: ChildProcessWithoutNullStreams | null = null;
  let nextId = 1;
  const pending = new Map<string, Pending>();
  const crashes: number[] = [];
  let disabled: Error | null = null;
  let ready = false;

  const failAll = (err: Error) => {
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    pending.clear();
  };

  const start = () => {
    const args = ["analysis", "-config", opts.config, "-model", opts.model];
    if (opts.humanModel) args.push("-human-model", opts.humanModel);
    const child = spawn(opts.bin, args, { stdio: ["pipe", "pipe", "pipe"] });
    proc = child;
    ready = false;
    createInterface({ input: child.stderr }).on("line", (line) => {
      if (/Started, ready to begin handling requests/.test(line)) {
        ready = true;
        console.log("[katago] ready");
      }
    });
    createInterface({ input: child.stdout }).on("line", (line) => {
      let raw: unknown;
      try {
        raw = JSON.parse(line);
      } catch {
        return;
      }
      if (typeof raw !== "object" || raw === null || !("id" in raw)) return;
      const id = String(raw.id);
      const p = pending.get(id);
      if (!p) return;
      if ("error" in raw) {
        pending.delete(id);
        clearTimeout(p.timer);
        p.reject(new Error(`KataGo: ${String(raw.error)}`));
        return;
      }
      const parsed = KataGoResponseSchema.safeParse(raw);
      if (!parsed.success || parsed.data.isDuringSearch) return;
      p.got.push(parsed.data);
      if (p.got.length >= p.turns) {
        pending.delete(id);
        clearTimeout(p.timer);
        p.resolve(p.got.sort((a, b) => a.turnNumber - b.turnNumber));
      }
    });
    child.on("exit", (code, signal) => {
      proc = null;
      ready = false;
      failAll(new Error(`KataGo exited (${code ?? signal})`));
      const now = Date.now();
      crashes.push(now);
      while (crashes.length > 0 && (crashes[0] as number) < now - CRASH_WINDOW_MS) crashes.shift();
      if (crashes.length >= MAX_CRASHES) {
        disabled = new Error("KataGo crashed repeatedly; disabled");
        console.error("[katago]", disabled.message);
      }
    });
    child.on("error", (err) => {
      disabled = err;
      console.error("[katago] could not start", err);
    });
  };

  return {
    query(q: KataGoQuery, timeoutMs: number) {
      return new Promise<KataGoResponse[]>((resolve, reject) => {
        if (disabled) {
          reject(disabled);
          return;
        }
        if (!proc) start();
        const id = q.id ?? `q${nextId++}`;
        const turns = q.analyzeTurns?.length ?? 1;
        const timer = setTimeout(() => {
          pending.delete(id);
          proc?.stdin.write(
            `${JSON.stringify({ id: `t${id}`, action: "terminate", terminateId: id })}\n`,
          );
          reject(new Error("KataGo query timed out"));
        }, timeoutMs);
        pending.set(id, { turns, got: [], resolve, reject, timer });
        proc?.stdin.write(`${JSON.stringify({ ...q, id })}\n`);
      });
    },
    status() {
      if (disabled) return { ready: false, detail: disabled.message };
      return { ready, detail: ready ? "ready" : proc ? "loading" : "idle" };
    },
  };
}
