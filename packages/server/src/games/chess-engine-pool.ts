/**
 * UCI engines for chess AI seats: Stockfish 19 (lite, single-threaded WASM)
 * for classical chess and Fairy-Stockfish for bughouse, each a long-lived
 * `node` CHILD PROCESS speaking UCI over stdio.
 *
 * Child processes rather than worker threads: Stockfish.js detects
 * `worker_threads` and switches to its browser-worker protocol, and a search
 * pins a core for its whole think time — a separate process keeps the
 * server's event loop and memory accounting clean, and a crash or hang costs
 * one respawn, never the server. The engines load from `node_modules`, so the
 * build emits nothing extra.
 *
 * Processes start on the first AI decision, so tests and sessions without an
 * engine seat never spawn one. A missing package, a crash or a timeout
 * rejects; the chess machine then plays its built-in move.
 *
 * Env: CHESS_AI_ENGINES (Stockfish processes, default 2; 0 disables),
 * BUGHOUSE_AI_ENGINES (Fairy-Stockfish processes, default 1 — ~360 MB each).
 */

import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";

const require = createRequire(import.meta.url);

/** Crashes and timeouts tolerated before a variant's pool gives up for good. */
const MAX_RESPAWNS = 5;
/** Engine start-up (WASM compile + `uciok`/`readyok`). */
const BOOT_TIMEOUT_MS = 20_000;
/** Above a search's own time budget, before the engine is presumed hung. */
const SEARCH_SLACK_MS = 5_000;

export type EngineVariant = "chess" | "bughouse";

export interface SearchRequest {
  /** UCI `setoption` pairs, applied before the search (options persist, so set every one). */
  readonly options: readonly (readonly [string, string])[];
  /** `position …` argument, e.g. `fen <fen> moves e2e4 e7e5` or `startpos`. */
  readonly position: string;
  /** `go …` argument, e.g. `movetime 300` or `depth 1`. */
  readonly go: string;
  /** Longest the search may take; the request rejects at this plus slack. */
  readonly budgetMs: number;
}

interface Launch {
  readonly args: readonly string[];
  /** Commands sent once after `uciok`, before `isready`. */
  readonly init: readonly string[];
}

function stockfishLaunch(): Launch | null {
  try {
    const pkg = dirname(require.resolve("stockfish/package.json"));
    return {
      args: [join(pkg, "bin", "stockfish-19-lite-single.js")],
      init: ["setoption name Hash value 16"],
    };
  } catch {
    return null;
  }
}

/**
 * Fairy-Stockfish's Emscripten loader fetches its .wasm by URL, which modern
 * Node's global `fetch` can't do for a file path — so the bootstrap hands it
 * the bytes and pipes stdin lines in as UCI commands.
 */
const FAIRY_BOOTSTRAP = `
const fs = require("node:fs"), path = require("node:path"), readline = require("node:readline");
const dir = process.argv[1];
require(path.join(dir, "stockfish.js"))({
  wasmBinary: fs.readFileSync(path.join(dir, "stockfish.wasm")),
  locateFile: (f) => path.join(dir, f),
}).then((sf) => {
  sf.addMessageListener((line) => process.stdout.write(line + "\\n"));
  const rl = readline.createInterface({ input: process.stdin });
  rl.on("line", (l) => {
    if (l === "quit") process.exit(0);
    sf.postMessage(l);
  });
  // The server went away (stdin closed): never outlive it.
  rl.on("close", () => process.exit(0));
});`;

function fairyLaunch(): Launch | null {
  try {
    const pkg = dirname(require.resolve("fairy-stockfish-nnue.wasm/package.json"));
    return {
      args: ["-e", FAIRY_BOOTSTRAP, pkg],
      init: ["setoption name UCI_Variant value bughouse", "setoption name Hash value 16"],
    };
  } catch {
    return null;
  }
}

/** One engine process and its line stream. */
class UciEngine {
  private readonly child: ChildProcessWithoutNullStreams;
  private waiter: {
    match: RegExp;
    resolve: (line: string) => void;
    reject: (e: Error) => void;
  } | null = null;
  dead = false;

  constructor(launch: Launch, onExit: () => void) {
    this.child = spawn(process.execPath, [...launch.args], { stdio: ["pipe", "pipe", "pipe"] });
    this.child.stdin.on("error", () => {});
    this.child.stderr.resume();
    createInterface({ input: this.child.stdout }).on("line", (line) => {
      if (this.waiter?.match.test(line)) {
        const w = this.waiter;
        this.waiter = null;
        w.resolve(line);
      }
    });
    this.child.on("exit", () => {
      this.dead = true;
      this.waiter?.reject(new Error("chess engine exited"));
      this.waiter = null;
      onExit();
    });
  }

  send(cmd: string): void {
    if (!this.dead) this.child.stdin.write(`${cmd}\n`);
  }

  /** Resolve with the first output line matching `match` after this call. */
  expect(match: RegExp, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiter = null;
        reject(new Error(`chess engine timed out waiting for ${match}`));
      }, timeoutMs);
      this.waiter = {
        match,
        resolve: (line) => {
          clearTimeout(timer);
          resolve(line);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      };
    });
  }

  kill(): void {
    this.dead = true;
    this.child.kill("SIGKILL");
  }
}

interface Job {
  readonly request: SearchRequest;
  readonly resolve: (uci: string) => void;
  readonly reject: (e: Error) => void;
}

interface Slot {
  engine: UciEngine | null;
  ready: Promise<UciEngine> | null;
  busy: boolean;
}

export interface EnginePool {
  search(request: SearchRequest): Promise<string>;
}

function createPool(name: string, size: number, launch: Launch): EnginePool {
  const slots: Slot[] = Array.from({ length: size }, () => ({
    engine: null,
    ready: null,
    busy: false,
  }));
  const queue: Job[] = [];
  let respawns = 0;
  let failed: Error | null = null;

  const boot = (slot: Slot): Promise<UciEngine> => {
    if (slot.ready) return slot.ready;
    slot.ready = (async () => {
      const engine = new UciEngine(launch, () => {
        if (slot.engine === engine) {
          slot.engine = null;
          slot.ready = null;
        }
      });
      slot.engine = engine;
      engine.send("uci");
      await engine.expect(/^uciok/, BOOT_TIMEOUT_MS);
      for (const cmd of launch.init) engine.send(cmd);
      engine.send("isready");
      await engine.expect(/^readyok/, BOOT_TIMEOUT_MS);
      return engine;
    })();
    slot.ready.catch(() => {
      slot.ready = null;
    });
    return slot.ready;
  };

  const recycle = (slot: Slot, err: Error): void => {
    slot.engine?.kill();
    slot.engine = null;
    slot.ready = null;
    respawns += 1;
    console.error(
      `[chess-engines] ${name} engine failed (${respawns}/${MAX_RESPAWNS}):`,
      err.message,
    );
    if (respawns >= MAX_RESPAWNS) {
      failed = new Error(`${name} engines disabled after ${MAX_RESPAWNS} failures`);
      for (const job of queue.splice(0)) job.reject(failed);
    }
  };

  const run = async (slot: Slot, job: Job): Promise<void> => {
    try {
      const engine = await boot(slot);
      for (const [option, value] of job.request.options) {
        engine.send(`setoption name ${option} value ${value}`);
      }
      engine.send(`position ${job.request.position}`);
      engine.send(`go ${job.request.go}`);
      const line = await engine.expect(/^bestmove /, job.request.budgetMs + SEARCH_SLACK_MS);
      const uci = line.split(/\s+/)[1] ?? "";
      if (!uci || uci === "(none)") throw new Error(`engine had no move: ${line}`);
      job.resolve(uci);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      recycle(slot, error);
      job.reject(error);
    }
  };

  const pump = (): void => {
    for (const slot of slots) {
      if (slot.busy || queue.length === 0) continue;
      const job = queue.shift();
      if (!job) return;
      slot.busy = true;
      void run(slot, job).finally(() => {
        slot.busy = false;
        pump();
      });
    }
  };

  return {
    search(request) {
      if (failed) return Promise.reject(failed);
      return new Promise((resolve, reject) => {
        queue.push({ request, resolve, reject });
        pump();
      });
    },
  };
}

function poolSize(envName: string, fallback: number): number {
  const raw = process.env[envName];
  const n = raw === undefined || raw === "" ? fallback : Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

const pools = new Map<EngineVariant, EnginePool | null>();

/** The engine pool for a variant, or `null` when disabled or not installed. Lazy. */
export function enginePool(variant: EngineVariant): EnginePool | null {
  if (pools.has(variant)) return pools.get(variant) ?? null;
  const size =
    variant === "chess" ? poolSize("CHESS_AI_ENGINES", 2) : poolSize("BUGHOUSE_AI_ENGINES", 1);
  const launch = size > 0 ? (variant === "chess" ? stockfishLaunch() : fairyLaunch()) : null;
  if (size > 0 && !launch) console.warn(`[chess-engines] ${variant} engine package not found`);
  const pool = launch ? createPool(variant, size, launch) : null;
  pools.set(variant, pool);
  return pool;
}
