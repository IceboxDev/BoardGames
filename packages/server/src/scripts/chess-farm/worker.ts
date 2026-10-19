/**
 * The chess analysis farm worker (runs on ws21): claims evaluation jobs from
 * the server, analyses each by BEST_MOVE (`pipeline.ts`) and posts the
 * result. Jobs run one at a time on Stockfish with every thread; Lc0 searches
 * the same position on the GPU meanwhile. After each one the worker queues its
 * follow-ups (`follow-ups.ts`) and claims them next, depth first, without
 * `ucinewgame`: the hash still holds most of their search.
 *
 *   pnpm --filter @boardgames/server exec tsx src/scripts/chess-farm/worker.ts
 *
 * Env:
 *   FARM_URL            server base, e.g. https://api.example.com (required)
 *   CHESS_FARM_TOKEN    bearer token (required)
 *   FARM_WORKER         worker name (default: hostname)
 *   SF_PATH             Stockfish binary (required). It always runs core's `SEARCH` (one
 *                       thread, the same hash) — a machine runs one worker per core instead
 *   LC0_PATH, LC0_WEIGHTS, LC0_BACKEND (optional; without them ties fall back to Stockfish order)
 *   FARM_LOOKUPS=1      ask lichess / ChessDB first (off: every result is the farm's own search)
 *   FARM_FOLLOW_UPS=0   don't queue follow-ups (claim by reach only)
 *   FARM_KINDS          `user`, `opp` or `user,opp` (default): the positions this worker takes —
 *                       ws21 searches your moves, the AWS fleet the opponents'
 *   FARM_IDLE_EXIT_MIN  exit (code 0) after this many minutes with nothing to claim; an AWS
 *                       instance's unit then shuts the machine down so idle time costs nothing
 *   FARM_ORDER          `reach` (default: most played on lichess first, then most of your
 *                       games) or `deep` (its own follow-ups, then the deepest waiting
 *                       position: finishes lines)
 *   LC0_SERVE_PORT      also serve this worker's Lc0 on 127.0.0.1 to the fleet (ws21: 3002)
 *   LC0_URL             use that remote Lc0 instead of a local one (fleet: http://localhost:3002/)
 */
import { statSync } from "node:fs";
import { hostname } from "node:os";
import { parseFen, positionKey } from "@boardgames/core/games/chess/engine/fen";
import { SEARCH } from "@boardgames/core/games/chess/trainer/eval-policy";
import {
  legalPrefix,
  otherColor,
  PositionIndex,
  type TrainerGame,
} from "@boardgames/core/games/chess/trainer/position-index";
import {
  FARM_PREFER_MAX,
  FarmClaimResponseSchema,
  FarmEnqueueResponseSchema,
  FarmGamesPageSchema,
  type FarmJob,
  FarmOkSchema,
  FarmPopularResponseSchema,
  FARM_NODE_LIMIT_PREFIX as NODE_LIMIT_PREFIX,
  type PositionEval,
} from "@boardgames/core/protocol";
import type { z } from "zod";
import { followUps, needsPopular } from "./follow-ups.ts";
import { RemoteLc0, serveLc0 } from "./lc0-remote.ts";
import {
  analyse,
  defaultPolicy,
  type FarmEngines,
  Lc0Lane,
  type Lc0Source,
  ShortSearch,
} from "./pipeline.ts";
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
const KINDS = (process.env.FARM_KINDS ?? "user,opp")
  .split(",")
  .map((k) => k.trim())
  .filter((k): k is "user" | "opp" => k === "user" || k === "opp");
if (KINDS.length === 0) throw new Error("FARM_KINDS must name user and/or opp");
const IDLE_EXIT_MS = Number(process.env.FARM_IDLE_EXIT_MIN ?? 0) * 60_000;
const ORDER = process.env.FARM_ORDER === "deep" ? "deep" : "reach";

async function farm<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
  const res = await fetch(`${FARM_URL}/api/chess-farm${path}`, {
    ...(body === undefined ? { method: "GET" } : { method: "POST", body: JSON.stringify(body) }),
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text().catch(() => "")}`);
  return schema.parse(await res.json());
}

/** A member's games as one colour, indexed; re-read after an hour (new imports). */
const INDEX_TTL_MS = 3600_000;
const indexes = new Map<string, { at: number; index: Promise<PositionIndex> }>();

async function loadIndex(user: string, color: "w" | "b"): Promise<PositionIndex> {
  const games: TrainerGame[] = [];
  let cursor: string | null = null;
  do {
    const q: URLSearchParams = new URLSearchParams({ user, color, ...(cursor ? { cursor } : {}) });
    const page: z.infer<typeof FarmGamesPageSchema> = await farm(
      `/games?${q}`,
      undefined,
      FarmGamesPageSchema,
    );
    for (const g of page.games)
      games.push({ id: g.id, moves: legalPrefix(g.uci), result: g.result });
    cursor = page.next;
  } while (cursor);
  return PositionIndex.build(games);
}

function gamesIndex(user: string, color: "w" | "b"): Promise<PositionIndex> {
  const key = `${user}:${color}`;
  const hit = indexes.get(key);
  if (hit && Date.now() - hit.at < INDEX_TTL_MS) return hit.index;
  const index = loadIndex(user, color);
  indexes.set(key, { at: Date.now(), index });
  index.catch(() => indexes.delete(key));
  return index;
}

/** The explorer's most played moves (ws21 asks lichess; retried while lichess is busy). */
async function popularAt(fen: string): Promise<string[]> {
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await farm(
        `/popular?${new URLSearchParams({ fen })}`,
        undefined,
        FarmPopularResponseSchema,
      );
      return r.moves.map((m) => m.uci);
    } catch (err) {
      if (attempt >= 4) throw err;
      await new Promise((r) => setTimeout(r, 60_000));
    }
  }
}

/**
 * Queue what `job` leads to and return the positions now waiting, most wanted
 * first (a failure here only costs the warm hash). A follow-up the farm has
 * already analysed is walked through to its own follow-ups, so positions lost
 * below it (a re-run of a capped search, a cleared queue) come back on their own.
 */
async function queueFollowUps(
  job: FarmJob,
  result: PositionEval,
  seen = new Set<string>(),
): Promise<string[]> {
  if (!job.requestedBy) return [];
  const side = parseFen(job.fen).turn;
  const color = job.kind === "user" ? side : otherColor(side);
  const popular = needsPopular(job) ? await popularAt(job.fen) : [];
  const items = followUps(job, result, await gamesIndex(job.requestedBy, color), popular).filter(
    (i) => {
      const key = positionKey(parseFen(i.fen));
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    },
  );
  if (items.length === 0) return [];
  const r = await farm(
    "/enqueue",
    { requestedBy: job.requestedBy, items: items.slice(0, FARM_PREFER_MAX) },
    FarmEnqueueResponseSchema,
  );
  const queued = [...r.queued];
  for (const item of items) {
    const known = r.known?.[item.fen];
    if (!known) continue;
    const below: FarmJob = {
      ...job,
      id: -1,
      fen: item.fen,
      kind: item.kind,
      reach: item.reach,
      stage: item.stage,
    };
    queued.push(...(await queueFollowUps(below, known, seen)));
  }
  return queued;
}

async function main() {
  const threads = SEARCH.threads;
  const sf = new UciEngine(need("SF_PATH"), [], log);
  await sf.init({ Threads: SEARCH.threads, Hash: SEARCH.hashMb, MultiPV: 1 });
  let lc0: Lc0Source | null = null;
  let lc0Engine: UciEngine | null = null;
  if (process.env.LC0_URL) {
    lc0 = new RemoteLc0(process.env.LC0_URL, TOKEN);
  } else if (process.env.LC0_PATH && process.env.LC0_WEIGHTS) {
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
    lc0Engine = engine;
    if (process.env.LC0_SERVE_PORT) serveLc0(lc0, Number(process.env.LC0_SERVE_PORT), TOKEN, log);
  }
  const label = [
    `stockfish ${process.env.SF_LABEL ?? need("SF_PATH").split("/").at(-1)}`,
    lc0 ? `lc0 ${process.env.LC0_LABEL ?? process.env.LC0_WEIGHTS?.split("/").at(-1)}` : null,
  ]
    .filter(Boolean)
    .join(" + ");
  const policy = { ...defaultPolicy(), lookups: process.env.FARM_LOOKUPS === "1" };
  const engines: FarmEngines = { sf, lc0, label };
  log(
    `worker ${WORKER} up: ${label}${process.env.LC0_URL ? " (remote)" : ""}, ${threads} threads,` +
      ` takes ${KINDS.join(" + ")}, ${ORDER === "deep" ? "deepest" : "most reached"} first`,
  );
  let idleSince = Date.now();

  const chaining = process.env.FARM_FOLLOW_UPS !== "0";
  /** Follow-ups to claim first: the newest job's at the front (depth first). */
  let chain: string[] = [];
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
        { worker: WORKER, id: current.id, error: "worker stopped", retry: true, released: true },
        FarmOkSchema,
      ).catch(() => {});
    }
    sf.quit();
    lc0Engine?.quit();
    // Not 0: only an idle exit (below) may let a fleet unit power the machine off.
    process.exit(143);
  };
  // A long search says how deep it has got, so its finish can be judged.
  setInterval(() => {
    const p = sf.progress;
    if (!current || !p) return;
    const hours = ((Date.now() - p.startedAt) / 3_600_000).toFixed(1);
    log(`#${current.id} ${current.kind} reach ${current.reach}: d${p.depth} after ${hours} h`);
  }, 30 * 60_000).unref();
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  // A new bundle on disk (a deploy): finish the job in hand, then restart on it.
  // Not 0, so the unit's Restart=on-failure brings the lane back.
  const bundleTime = () => {
    try {
      return statSync(process.argv[1] ?? "").mtimeMs;
    } catch {
      return null;
    }
  };
  const startedOn = bundleTime();

  while (!stopping) {
    if (startedOn !== null && bundleTime() !== startedOn) {
      log("new worker on disk — restarting");
      sf.quit();
      lc0Engine?.quit();
      process.exit(75);
    }
    let jobs: FarmJob[];
    try {
      // One at a time: a deep job can take most of an hour, and its lease runs meanwhile.
      const prefer = chain.slice(0, FARM_PREFER_MAX);
      jobs = (
        await farm(
          "/claim",
          {
            worker: WORKER,
            max: 1,
            kinds: KINDS,
            order: ORDER,
            ...(prefer.length > 0 ? { prefer } : {}),
          },
          FarmClaimResponseSchema,
        )
      ).jobs;
    } catch (err) {
      log("claim failed:", err instanceof Error ? err.message : err);
      await new Promise((r) => setTimeout(r, IDLE_MS));
      continue;
    }
    if (jobs.length === 0) {
      chain = [];
      if (IDLE_EXIT_MS > 0 && Date.now() - idleSince > IDLE_EXIT_MS) {
        log(`nothing to do for ${IDLE_EXIT_MS / 60_000} min — exiting`);
        sf.quit();
        lc0Engine?.quit();
        process.exit(0);
      }
      await new Promise((r) => setTimeout(r, IDLE_MS));
      continue;
    }
    idleSince = Date.now();
    for (const job of jobs) {
      if (stopping) break;
      current = job;
      const key = positionKey(parseFen(job.fen));
      const wasChained = chain.some((f) => positionKey(parseFen(f)) === key);
      chain = chain.filter((f) => positionKey(parseFen(f)) !== key);
      try {
        const result: PositionEval = await analyse(job, engines, policy);
        await farm("/complete", { worker: WORKER, id: job.id, result }, FarmOkSchema);
        log(
          `#${job.id} ${job.kind} reach ${job.reach}: ${result.best} d${result.depth} ${result.source}` +
            ` ${result.ties.length > 1 ? `ties ${result.ties.join(",")}` : ""}${result.contested ? " CONTESTED" : ""}` +
            ` ${result.seconds.toFixed(0)}s${wasChained ? " (follow-up)" : ""}`,
        );
        if (chaining) {
          const next = await queueFollowUps(job, result).catch((err): string[] => {
            log(`#${job.id} follow-ups failed:`, err instanceof Error ? err.message : err);
            return [];
          });
          chain = [...next, ...chain.filter((f) => !next.includes(f))].slice(
            0,
            4 * FARM_PREFER_MAX,
          );
        }
      } catch (err) {
        if (err instanceof ShortSearch) {
          // Not stored, nothing queued below it; this worker won't take it again.
          log(`#${job.id} ${job.kind} reach ${job.reach}: ${err.message} — handed on`);
          await farm(
            "/fail",
            {
              worker: WORKER,
              id: job.id,
              error: `${NODE_LIMIT_PREFIX}${WORKER}: ${err.message}`,
              retry: true,
            },
            FarmOkSchema,
          ).catch(() => {});
          current = null;
          continue;
        }
        const message = err instanceof Error ? err.message : String(err);
        log(`#${job.id} failed: ${message}`);
        // An engine that no longer answers fails every job it's given: restart the lane.
        const responsive =
          sf.alive &&
          (await sf.ready(30_000).then(
            () => true,
            () => false,
          ));
        if (!responsive) {
          await farm(
            "/fail",
            { worker: WORKER, id: job.id, error: message, retry: true },
            FarmOkSchema,
          ).catch(() => {});
          throw new Error(sf.alive ? "Stockfish stopped answering" : "Stockfish died");
        }
        await farm(
          "/fail",
          { worker: WORKER, id: job.id, error: message, retry: true },
          FarmOkSchema,
        ).catch(() => {});
      }
      current = null;
      idleSince = Date.now();
    }
  }
}

main().catch((err) => {
  log("fatal:", err);
  process.exit(1);
});
