/**
 * The chess analysis farm worker (runs on ws21): claims evaluation jobs from
 * the server, analyses each by BEST_MOVE_V1 (`pipeline.ts`) and posts the
 * result. Jobs run one at a time on Stockfish with every thread; Lc0 searches
 * the same position on the GPU meanwhile. Positions are searched in claim
 * order without `ucinewgame`, so the hash carries over between neighbours.
 *
 *   pnpm --filter @boardgames/server exec tsx src/scripts/chess-farm/worker.ts
 *
 * Env:
 *   FARM_URL            server base, e.g. https://api.example.com (required)
 *   CHESS_FARM_TOKEN    bearer token (required)
 *   FARM_WORKER         worker name (default: hostname)
 *   SF_PATH             Stockfish binary (required)
 *   SF_THREADS          default: all CPUs − 2
 *   SF_HASH_MB          default 16384
 *   LC0_PATH, LC0_WEIGHTS, LC0_BACKEND (optional; without them ties fall back to Stockfish order)
 *   FARM_POLICY         policy JSON from `calibrate.ts` (tier depths, node caps)
 *   FARM_LOOKUPS=0      skip lichess / ChessDB (search everything; for testing)
 */
import { readFileSync } from "node:fs";
import { availableParallelism, hostname } from "node:os";
import {
  FarmClaimResponseSchema,
  type FarmJob,
  FarmOkSchema,
  type PositionEval,
} from "@boardgames/core/protocol";
import { z } from "zod";
import { analyse, defaultPolicy, type FarmEngines, type FarmPolicy, Lc0Lane } from "./pipeline.ts";
import { UciEngine } from "./uci.ts";

const log = (...args: unknown[]) => console.log(new Date().toISOString(), ...args);

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
}

const FARM_URL = need("FARM_URL").replace(/\/$/, "");
const TOKEN = need("CHESS_FARM_TOKEN");
const WORKER = process.env.FARM_WORKER ?? hostname();
const IDLE_MS = 30_000;

async function farm<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
  const res = await fetch(`${FARM_URL}/api/chess-farm${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text().catch(() => "")}`);
  return schema.parse(await res.json());
}

const PolicyFileSchema = z.object({
  tiers: z.array(
    z.object({
      name: z.enum(["trunk", "main", "rare", "leaf"]),
      minReach: z.number(),
      depth: z.number(),
    }),
  ),
  oppDepth: z.number(),
  nps: z.number(),
  nodesToDepth: z.record(z.string(), z.number()),
  capFactor: z.number().default(1.5),
});

function loadPolicy(nps: number): FarmPolicy {
  const file = process.env.FARM_POLICY;
  const base = defaultPolicy(nps);
  if (!file) return base;
  const p = PolicyFileSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  const known = Object.entries(p.nodesToDepth)
    .map(([d, n]) => [Number(d), n] as const)
    .sort((a, b) => a[0] - b[0]);
  const nodesAt = (depth: number) => {
    let best = known[0];
    for (const k of known) if (k[0] <= depth) best = k;
    if (!best) return nps * 600;
    // Geometric extension past the last measured depth (~1.25× per ply).
    return best[1] * 1.25 ** Math.max(0, depth - best[0]);
  };
  return {
    ...base,
    tiers: p.tiers,
    oppDepth: p.oppDepth,
    nodeCap: (d) => Math.round(nodesAt(d) * p.capFactor),
  };
}

async function main() {
  const threads = Number(process.env.SF_THREADS ?? Math.max(1, availableParallelism() - 2));
  const sf = new UciEngine(need("SF_PATH"), [], log);
  await sf.init({ Threads: threads, Hash: Number(process.env.SF_HASH_MB ?? 16384), MultiPV: 1 });
  let lc0: Lc0Lane | null = null;
  if (process.env.LC0_PATH && process.env.LC0_WEIGHTS) {
    const engine = new UciEngine(
      process.env.LC0_PATH,
      [
        `--weights=${process.env.LC0_WEIGHTS}`,
        `--backend=${process.env.LC0_BACKEND ?? "cuda-fp16"}`,
      ],
      log,
    );
    await engine.init({ VerboseMoveStats: true, UCI_ShowWDL: true, Threads: 2 });
    lc0 = new Lc0Lane(engine);
  }
  const label = [
    `stockfish ${process.env.SF_LABEL ?? need("SF_PATH").split("/").at(-1)}`,
    lc0 ? `lc0 ${process.env.LC0_LABEL ?? process.env.LC0_WEIGHTS?.split("/").at(-1)}` : null,
  ]
    .filter(Boolean)
    .join(" + ");
  const policy = { ...loadPolicy(30e6), lookups: process.env.FARM_LOOKUPS !== "0" };
  const engines: FarmEngines = { sf, lc0, label };
  log(`worker ${WORKER} up: ${label}, ${threads} threads`);

  let current: FarmJob | null = null;
  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    log("stopping…");
    sf.stop();
    if (current) {
      await farm(
        "/fail",
        { worker: WORKER, id: current.id, error: "worker stopped", retry: true },
        FarmOkSchema,
      ).catch(() => {});
    }
    sf.quit();
    lc0?.engine.quit();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  while (!stopping) {
    let jobs: FarmJob[];
    try {
      // One at a time: a deep job can take most of an hour, and its lease runs meanwhile.
      jobs = (await farm("/claim", { worker: WORKER, max: 1 }, FarmClaimResponseSchema)).jobs;
    } catch (err) {
      log("claim failed:", err instanceof Error ? err.message : err);
      await new Promise((r) => setTimeout(r, IDLE_MS));
      continue;
    }
    if (jobs.length === 0) {
      await new Promise((r) => setTimeout(r, IDLE_MS));
      continue;
    }
    for (const job of jobs) {
      if (stopping) break;
      current = job;
      try {
        const result: PositionEval = await analyse(job, engines, policy);
        await farm("/complete", { worker: WORKER, id: job.id, result }, FarmOkSchema);
        log(
          `#${job.id} ${job.kind} reach ${job.reach}: ${result.best} d${result.depth} ${result.source}` +
            ` ${result.ties.length > 1 ? `ties ${result.ties.join(",")}` : ""}${result.contested ? " CONTESTED" : ""}` +
            ` ${result.seconds.toFixed(0)}s`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log(`#${job.id} failed: ${message}`);
        if (!sf.alive) {
          await farm(
            "/fail",
            { worker: WORKER, id: job.id, error: message, retry: true },
            FarmOkSchema,
          ).catch(() => {});
          throw new Error("Stockfish died");
        }
        await farm(
          "/fail",
          { worker: WORKER, id: job.id, error: message, retry: true },
          FarmOkSchema,
        ).catch(() => {});
      }
      current = null;
    }
  }
}

main().catch((err) => {
  log("fatal:", err);
  process.exit(1);
});
