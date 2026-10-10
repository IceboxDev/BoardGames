/**
 * KataGo reviews of Go games (`go_reviews`, migration 0052).
 *
 * Every finished online match is queued by Go's `afterGameOver`; members can
 * also import an SGF. One runner in this process takes queued rows oldest
 * first and analyses every position at low priority — live AI moves on the
 * same KataGo outrank it — writing progress per chunk so the page can show a
 * bar. Nothing runs when KataGo isn't configured; the routes then answer
 * `unavailable`.
 *
 * Env: GO_ANALYSIS_VISITS (per position, default 100).
 */
import { replay } from "@boardgames/core/games/go/game";
import { GoReplayLogSchema } from "@boardgames/core/games/go/replay-log";
import { parseSgf } from "@boardgames/core/games/go/sgf";
import type { GoGame } from "@boardgames/core/games/go/types";
import {
  type GoMoveAnalysis,
  type GoReview,
  type GoReviewAnalysis,
  GoReviewAnalysisSchema,
  type GoReviewStatus,
  GoReviewStatusSchema,
} from "@boardgames/core/protocol";
import { z } from "zod";
import { getDb } from "../db.ts";
import { kataGoEngine } from "../katago/engine.ts";
import { baseQuery } from "../katago/go-agent.ts";
import type { KataGoEngine, KataGoResponse } from "../katago/protocol.ts";
import { jsonColumn, parseRow, parseRows } from "../lib/db-rows.ts";
import { getMatchLog } from "../matches/store.ts";

const CHUNK = 24;
const POLL_MS = 5_000;
const ANALYSIS_PRIORITY = -10;
/** Imported reviews a member may have waiting at once, and per day. */
export const MAX_PENDING_PER_MEMBER = 3;
export const MAX_PER_DAY_PER_MEMBER = 10;

const ReviewRowSchema = z.object({
  id: z.number(),
  owner_user_id: z.string().nullable(),
  replay_id: z.number().nullable(),
  sgf: z.string().nullable(),
  status: GoReviewStatusSchema,
  progress: z.number(),
  result_json: jsonColumn(GoReviewAnalysisSchema).nullable(),
  error: z.string().nullable(),
  created_at: z.string(),
});
type ReviewRow = z.infer<typeof ReviewRowSchema>;

const COLUMNS =
  "id, owner_user_id, replay_id, sgf, status, progress, result_json, error, created_at";

function toReview(row: ReviewRow): GoReview {
  return {
    id: row.id,
    status: row.status,
    progress: Math.min(1, Math.max(0, row.progress)),
    analysis: row.result_json,
    sgf: row.sgf,
    error: row.error,
  };
}

export function unavailableReview(): GoReview {
  return { id: null, status: "unavailable", progress: 0, analysis: null, sgf: null, error: null };
}

// ── Queue ─────────────────────────────────────────────────────────────────

/** Queue a finished match (idempotent: one review per replay). */
export async function enqueueReplayReview(replayId: number): Promise<void> {
  await getDb().execute({
    sql: "INSERT INTO go_reviews (replay_id, status) VALUES (?, 'queued') ON CONFLICT(replay_id) DO NOTHING",
    args: [replayId],
  });
}

export type CreateResult =
  | { ok: true; id: number; moves: number }
  | { ok: false; status: 400 | 429; message: string };

/** Queue an imported SGF for `userId`, after validating it replays. */
export async function createSgfReview(userId: string, sgf: string): Promise<CreateResult> {
  let moves: number;
  try {
    moves = parseSgf(sgf).moves.length;
  } catch (err) {
    return { ok: false, status: 400, message: err instanceof Error ? err.message : "Bad SGF" };
  }
  const { rows } = await getDb().execute({
    sql: `SELECT
            SUM(CASE WHEN status IN ('queued', 'running') THEN 1 ELSE 0 END) AS pending,
            SUM(CASE WHEN created_at > datetime('now', '-1 day') THEN 1 ELSE 0 END) AS today
          FROM go_reviews WHERE owner_user_id = ? AND sgf IS NOT NULL`,
    args: [userId],
  });
  const counts = parseRow(
    z.object({ pending: z.number().nullable(), today: z.number().nullable() }),
    rows[0] ?? {},
    "go_reviews",
  );
  if ((counts.pending ?? 0) >= MAX_PENDING_PER_MEMBER) {
    return {
      ok: false,
      status: 429,
      message: "You already have reviews waiting — try again when they finish",
    };
  }
  if ((counts.today ?? 0) >= MAX_PER_DAY_PER_MEMBER) {
    return { ok: false, status: 429, message: "That's today's limit of imported reviews" };
  }
  const inserted = await getDb().execute({
    sql: "INSERT INTO go_reviews (owner_user_id, sgf, status) VALUES (?, ?, 'queued') RETURNING id",
    args: [userId, sgf],
  });
  const id = parseRow(z.object({ id: z.number() }), inserted.rows[0] ?? {}, "go_reviews").id;
  kick();
  return { ok: true, id, moves };
}

export async function reviewByReplay(replayId: number): Promise<GoReview | null> {
  const { rows } = await getDb().execute({
    sql: `SELECT ${COLUMNS} FROM go_reviews WHERE replay_id = ?`,
    args: [replayId],
  });
  return rows[0] ? toReview(parseRow(ReviewRowSchema, rows[0], "go_reviews")) : null;
}

/** An imported review — only its owner may read it. */
export async function reviewForOwner(id: number, userId: string): Promise<GoReview | null> {
  const { rows } = await getDb().execute({
    sql: `SELECT ${COLUMNS} FROM go_reviews WHERE id = ? AND owner_user_id = ?`,
    args: [id, userId],
  });
  return rows[0] ? toReview(parseRow(ReviewRowSchema, rows[0], "go_reviews")) : null;
}

export async function listOwnReviews(
  userId: string,
): Promise<{ id: number; status: GoReviewStatus; createdAt: string; summary: string }[]> {
  const { rows } = await getDb().execute({
    sql: `SELECT ${COLUMNS} FROM go_reviews WHERE owner_user_id = ? AND sgf IS NOT NULL
          ORDER BY id DESC LIMIT 50`,
    args: [userId],
  });
  return parseRows(ReviewRowSchema, rows, "go_reviews").map((r) => {
    let summary = "Imported game";
    try {
      const p = parseSgf(r.sgf ?? "");
      const who = [p.black, p.white].filter(Boolean).join(" vs ");
      summary = `${p.size}×${p.size}${who ? ` · ${who}` : ""} · ${p.moves.length} moves`;
    } catch {
      // A stored SGF always parsed once; keep the generic label if it no longer does.
    }
    return { id: r.id, status: r.status, createdAt: r.created_at, summary };
  });
}

// ── Analysis ──────────────────────────────────────────────────────────────

/** The game a review covers, as a start position plus moves. */
async function reviewGame(row: ReviewRow): Promise<GoGame> {
  if (row.replay_id !== null) {
    const log = GoReplayLogSchema.parse(await getMatchLog("go", row.replay_id));
    return replay(
      log,
      log.moves.map((m) => m.p),
    );
  }
  return parseSgf(row.sgf ?? "").game;
}

/** Fold KataGo's per-turn answers into per-move analysis. */
export function foldAnalysis(
  game: Pick<GoGame, "moves">,
  turns: readonly KataGoResponse[],
  visits: number,
): GoReviewAnalysis {
  const at = new Map(turns.map((t) => [t.turnNumber, t]));
  const first = at.get(0);
  const moves: GoMoveAnalysis[] = [];
  game.moves.forEach((m, i) => {
    const before = at.get(i);
    const after = at.get(i + 1);
    if (!before || !after) return;
    const top = [...before.moveInfos].sort((a, b) => a.order - b.order)[0];
    const swing = after.rootInfo.scoreLead - before.rootInfo.scoreLead;
    moves.push({
      move: i + 1,
      winrate: after.rootInfo.winrate,
      scoreLead: after.rootInfo.scoreLead,
      best: top?.move ?? null,
      pv: (top?.pv ?? []).slice(0, 8),
      loss: Math.max(0, m.color === 0 ? -swing : swing),
    });
  });
  return {
    visits,
    start: { winrate: first?.rootInfo.winrate ?? 0.5, scoreLead: first?.rootInfo.scoreLead ?? 0 },
    moves,
  };
}

export async function analyse(
  engine: KataGoEngine,
  game: GoGame,
  visits: number,
  onProgress: (fraction: number) => Promise<void>,
): Promise<GoReviewAnalysis> {
  const query = { ...baseQuery(game), maxVisits: visits, priority: ANALYSIS_PRIORITY };
  const total = game.moves.length + 1;
  const turns: KataGoResponse[] = [];
  for (let start = 0; start < total; start += CHUNK) {
    const analyzeTurns = Array.from(
      { length: Math.min(CHUNK, total - start) },
      (_, i) => start + i,
    );
    turns.push(...(await engine.query({ ...query, analyzeTurns }, 10 * 60_000)));
    await onProgress(Math.min(1, (start + analyzeTurns.length) / total));
  }
  return foldAnalysis(game, turns, visits);
}

// ── Runner ────────────────────────────────────────────────────────────────

let busy = false;
let timer: NodeJS.Timeout | null = null;

async function setStatus(
  id: number,
  status: GoReviewStatus,
  extra: { progress?: number; result?: GoReviewAnalysis; error?: string } = {},
) {
  await getDb().execute({
    sql: `UPDATE go_reviews SET status = ?, progress = COALESCE(?, progress),
            result_json = COALESCE(?, result_json), error = ?, updated_at = datetime('now')
          WHERE id = ?`,
    args: [
      status,
      extra.progress ?? null,
      extra.result ? JSON.stringify(extra.result) : null,
      extra.error ?? null,
      id,
    ],
  });
}

async function tick(): Promise<void> {
  if (busy) return;
  const engine = kataGoEngine();
  if (!engine) return;
  busy = true;
  try {
    const { rows } = await getDb().execute(
      `SELECT ${COLUMNS} FROM go_reviews WHERE status = 'queued' ORDER BY id LIMIT 1`,
    );
    if (!rows[0]) return;
    const row = parseRow(ReviewRowSchema, rows[0], "go_reviews");
    await setStatus(row.id, "running", { progress: 0 });
    try {
      const game = await reviewGame(row);
      const visits = Number(process.env.GO_ANALYSIS_VISITS ?? 100);
      const result = await analyse(engine, game, visits, (progress) =>
        setStatus(row.id, "running", { progress }),
      );
      await setStatus(row.id, "done", { progress: 1, result });
    } catch (err) {
      console.error(`[go-reviews] review ${row.id} failed`, err);
      await setStatus(row.id, "failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } catch (err) {
    console.error("[go-reviews] runner tick failed", err);
  } finally {
    busy = false;
  }
}

/** Look for work now rather than at the next poll. */
function kick(): void {
  if (timer) void tick();
}

/** Start the background runner (once, at server start). Re-queues rows a restart interrupted. */
export function startGoReviewRunner(): void {
  if (timer || !kataGoEngine()) return;
  void getDb()
    .execute("UPDATE go_reviews SET status = 'queued' WHERE status = 'running'")
    .catch((err) => console.error("[go-reviews] could not re-queue", err));
  timer = setInterval(() => void tick(), POLL_MS);
  timer.unref();
  console.log("[go-reviews] runner started");
}

/** Every finished match gets a review (when KataGo is there to write one). */
export async function goAfterGameOver(replayId: number | null): Promise<void> {
  if (replayId === null || !kataGoEngine()) return;
  await enqueueReplayReview(replayId);
  kick();
}
