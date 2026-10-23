/**
 * The lichess calls the trainer makes from the browser: the game export
 * (streamed NDJSON), the opening explorer and cloud evals. lichess asks API
 * users to make one request at a time and to wait a minute after a 429, so
 * every call but the export goes through one queue that does exactly that.
 */
import {
  fromLichessJson,
  type ImportedGame,
  type SkipReason,
} from "@boardgames/core/games/chess/trainer/imported-game";
import type { EngineLine, PopularMove } from "@boardgames/core/games/chess/trainer/tree";
import { z } from "zod";
import { LICHESS } from "./oauth";

const EXPLORER = "https://explorer.lichess.org";
const RATE_LIMIT_WAIT_MS = 60_000;
/** A request (body included) that takes longer fails, so it can't hold the queue forever. */
const REQUEST_TIMEOUT_MS = 30_000;

export class LichessAuthError extends Error {
  constructor() {
    super("lichess no longer accepts this connection — connect again.");
  }
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(signal.reason);
    });
  });

/**
 * Who is waiting: what's on screen first (`now`), then the tree build
 * (`build`), then lookups nobody is looking at yet (`background`).
 */
export type LichessPriority = "now" | "build" | "background";
const RANK: Record<LichessPriority, number> = { now: 0, build: 1, background: 2 };

/**
 * lichess refuses explorer requests faster than about one every three
 * seconds (measured 2026-10-20: a 429 after ~6 back to back, and still every
 * third at one per two seconds); its other endpoints get a second.
 */
const gapFor = (url: string) => (url.startsWith(EXPLORER) ? 3_000 : 1_000);

interface Job {
  readonly url: string;
  readonly token: string;
  readonly signal?: AbortSignal;
  readonly rank: number;
  readonly seq: number;
  readonly resolve: (r: Response) => void;
  readonly reject: (e: unknown) => void;
}

const jobs: Job[] = [];
let running = false;
let seq = 0;
let lastRequestAt = 0;
let rateLimitedUntil: number | null = null;

/** What the lichess queue is doing, for a status line: requests waiting, and a 429's wait. */
export function lichessQueue(): {
  readonly waiting: number;
  readonly rateLimitedUntil: number | null;
} {
  return { waiting: jobs.length + (running ? 1 : 0), rateLimitedUntil };
}

async function runJob(job: Job): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const wait = lastRequestAt + gapFor(job.url) - Date.now();
    if (wait > 0) await sleep(wait, job.signal);
    lastRequestAt = Date.now();
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const res = await fetch(job.url, {
      headers: { Authorization: `Bearer ${job.token}` },
      signal: job.signal ? AbortSignal.any([job.signal, timeout]) : timeout,
    });
    if (res.status === 401) throw new LichessAuthError();
    if (res.status !== 429 || attempt >= 3) return res;
    rateLimitedUntil = Date.now() + RATE_LIMIT_WAIT_MS;
    try {
      await sleep(RATE_LIMIT_WAIT_MS, job.signal);
    } finally {
      rateLimitedUntil = null;
    }
  }
}

async function pump(): Promise<void> {
  if (running) return;
  running = true;
  try {
    while (jobs.length > 0) {
      jobs.sort((a, b) => a.rank - b.rank || a.seq - b.seq);
      const job = jobs.shift() as Job;
      try {
        job.resolve(await runJob(job));
      } catch (err) {
        job.reject(err);
      }
    }
  } finally {
    running = false;
  }
}

/**
 * One lichess request at a time, the most urgent first, paced to what lichess
 * accepts; a 429 waits a minute and tries again; 30 s at most each.
 */
function queued(
  url: string,
  token: string,
  signal?: AbortSignal,
  priority: LichessPriority = "now",
): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    jobs.push({ url, token, signal, rank: RANK[priority], seq: seq++, resolve, reject });
    void pump();
  });
}

const UserSchema = z.object({ count: z.object({ all: z.number() }).optional() });

/** How many games the account has played (all variants — an upper bound for the import). */
export async function lichessGameCount(username: string, token: string): Promise<number | null> {
  const res = await queued(`${LICHESS}/api/user/${encodeURIComponent(username)}`, token);
  if (!res.ok) return null;
  return UserSchema.parse(await res.json()).count?.all ?? null;
}

export interface ExportProgress {
  /** Lines read from lichess. */
  readonly seen: number;
  readonly kept: number;
  readonly skipped: Readonly<Partial<Record<SkipReason, number>>>;
}

/**
 * Stream finished games of `username` since `since` (ms), oldest first,
 * handing kept games over in batches. lichess can end a long export early, so
 * this resolves with how many lines it read and the newest game's creation
 * time (skipped games included); the caller continues from there until a
 * pass reads nothing.
 */
export async function exportGames(opts: {
  username: string;
  lichessId: string;
  token: string;
  since: number;
  batchSize: number;
  onBatch: (games: ImportedGame[]) => Promise<void>;
  onProgress: (p: ExportProgress) => void;
  signal: AbortSignal;
}): Promise<{ seen: number; lastCreatedAt: number | null }> {
  const url = new URL(`${LICHESS}/api/games/user/${encodeURIComponent(opts.username)}`);
  url.search = new URLSearchParams({
    since: String(opts.since),
    sort: "dateAsc",
    moves: "true",
    tags: "false",
    finished: "true",
  }).toString();
  let res: Response;
  for (let attempt = 0; ; attempt++) {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${opts.token}`, Accept: "application/x-ndjson" },
      signal: opts.signal,
    });
    if (res.status !== 429 || attempt >= 3) break;
    await sleep(RATE_LIMIT_WAIT_MS, opts.signal);
  }
  if (res.status === 401) throw new LichessAuthError();
  if (!res.ok || !res.body) throw new Error(`lichess export failed (${res.status})`);

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let batch: ImportedGame[] = [];
  let seen = 0;
  let kept = 0;
  let lastCreatedAt: number | null = null;
  const skipped: Partial<Record<SkipReason, number>> = {};
  const flush = async () => {
    if (batch.length === 0) return;
    const out = batch;
    batch = [];
    await opts.onBatch(out);
  };
  const take = async (line: string) => {
    if (!line.trim()) return;
    seen++;
    let json: unknown = null;
    try {
      json = JSON.parse(line);
    } catch {
      json = null;
    }
    if (
      json &&
      typeof json === "object" &&
      "createdAt" in json &&
      typeof json.createdAt === "number"
    ) {
      lastCreatedAt = Math.max(lastCreatedAt ?? 0, json.createdAt);
    }
    const r = fromLichessJson(json, opts.lichessId);
    if ("game" in r) {
      kept++;
      batch.push(r.game);
      if (batch.length >= opts.batchSize) await flush();
    } else {
      skipped[r.skipped] = (skipped[r.skipped] ?? 0) + 1;
    }
    if (seen % 25 === 0) opts.onProgress({ seen, kept, skipped: { ...skipped } });
  };
  for (;;) {
    let chunk: ReadableStreamReadResult<string>;
    try {
      chunk = await reader.read();
    } catch (err) {
      if (opts.signal.aborted) throw err;
      break; // the connection dropped: hand back what arrived, the caller resumes
    }
    const { done, value } = chunk;
    if (done) break;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) await take(line);
  }
  await take(buffer);
  await flush();
  opts.onProgress({ seen, kept, skipped: { ...skipped } });
  return { seen, lastCreatedAt };
}

const ExplorerSchema = z.object({
  moves: z.array(
    z.object({ uci: z.string(), white: z.number(), draws: z.number(), black: z.number() }),
  ),
});

/** A database move with its results (White wins, draws, Black wins). */
export interface ExplorerMove extends PopularMove {
  readonly white: number;
  readonly draws: number;
  readonly black: number;
}

/** The lichess database's moves here (every rating, every speed), most played first. */
export async function explorerMoves(
  fen: string,
  token: string,
  priority: LichessPriority = "now",
): Promise<ExplorerMove[]> {
  const url = new URL(`${EXPLORER}/lichess`);
  url.search = new URLSearchParams({
    variant: "standard",
    fen,
    moves: "30",
    topGames: "0",
    recentGames: "0",
  }).toString();
  const res = await queued(url.toString(), token, undefined, priority);
  if (!res.ok) throw new Error(`explorer failed (${res.status})`);
  return ExplorerSchema.parse(await res.json())
    .moves.map((m) => ({
      uci: m.uci,
      games: m.white + m.draws + m.black,
      white: m.white,
      draws: m.draws,
      black: m.black,
    }))
    .sort((a, b) => b.games - a.games);
}

const CloudEvalSchema = z.object({
  depth: z.number(),
  pvs: z.array(
    z.object({ moves: z.string(), cp: z.number().optional(), mate: z.number().optional() }),
  ),
});

/**
 * lichess's cached deep evaluation of this position, scored from the side to
 * move, or `null` when lichess has none. (lichess scores from White's side.)
 */
export async function cloudEval(
  fen: string,
  multipv: number,
  token: string,
): Promise<(EngineLine & { pv: string[] })[] | null> {
  const url = new URL(`${LICHESS}/api/cloud-eval`);
  url.search = new URLSearchParams({ fen, multiPv: String(multipv) }).toString();
  const res = await queued(url.toString(), token);
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const body = CloudEvalSchema.parse(await res.json());
  const sign = fen.split(" ")[1] === "b" ? -1 : 1;
  return body.pvs.flatMap((pv) => {
    const uci = pv.moves.split(" ")[0];
    if (!uci) return [];
    return [
      {
        uci,
        cp: pv.cp === undefined ? null : sign * pv.cp,
        mate: pv.mate === undefined ? null : sign * pv.mate,
        depth: body.depth,
        pv: pv.moves.split(" ").filter(Boolean),
      },
    ];
  });
}
