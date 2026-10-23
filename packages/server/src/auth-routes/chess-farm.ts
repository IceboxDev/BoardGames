// Chess analysis farm — `/api/chess-farm/*`, for the worker on ws21.
//
//   POST /claim     lease up to `max` jobs (most reached first, or deepest first; the heavy
//                   lane: its handed-over jobs, smallest estimate first)
//   POST /complete  store a job's result (validated against the position)
//   POST /fail      give a job back (retry), mark it failed, or hand it to the heavy lane
//   POST /enqueue   queue a finished position's follow-ups (for the member who asked)
//   GET  /games     a member's games, so the worker can work out those follow-ups
//   GET  /popular   the lichess explorer's most played moves (pads opponent replies)
//   GET  /status    queue counts
//
// Not a browser surface: the worker authenticates with `Authorization:
// Bearer $CHESS_FARM_TOKEN` (no cookie), so it sits outside requireAuth like
// the BGA ingest. Without the env var the farm is off (503).

import { timingSafeEqual } from "node:crypto";
import { BEST_MOVE_SPEC } from "@boardgames/core/games/chess/trainer/eval-policy";
import {
  FarmClaimBodySchema,
  FarmClaimResponseSchema,
  FarmCompleteBodySchema,
  FarmEnqueueBodySchema,
  FarmEnqueueResponseSchema,
  FarmFailBodySchema,
  FarmGamesPageSchema,
  FarmGamesQuerySchema,
  FarmOkSchema,
  FarmPopularQuerySchema,
  FarmPopularResponseSchema,
  FarmStatusSchema,
} from "@boardgames/core/protocol";
import { publicApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import {
  claimJobs,
  completeJob,
  failJob,
  farmStats,
  LEASE_MS,
  requestEvals,
} from "../lib/chess-trainer/farm-store.ts";
import { popularMoves } from "../lib/chess-trainer/lichess-explorer.ts";
import { readGamesPage } from "../lib/chess-trainer/store.ts";
import { errorResponse, zJsonBody, zQuery } from "../lib/error-response.ts";

export const chessFarmRoutes = publicApp();

function tokenMatches(header: string | undefined, expected: string): boolean {
  const provided = Buffer.from(header?.replace(/^Bearer\s+/i, "") ?? "");
  const want = Buffer.from(expected);
  return provided.length === want.length && timingSafeEqual(provided, want);
}

chessFarmRoutes.use("*", async (c, next) => {
  const expected = process.env.CHESS_FARM_TOKEN;
  if (!expected) return errorResponse(c, 503, "The analysis farm is not configured");
  if (!tokenMatches(c.req.header("authorization"), expected)) {
    return errorResponse(c, 401, "Bad farm token");
  }
  await next();
});

chessFarmRoutes.post("/claim", zJsonBody(FarmClaimBodySchema), async (c) => {
  const { worker, max, prefer, kinds, order, lane } = c.req.valid("json");
  const jobs = await claimJobs(getDb(), worker, max, prefer, kinds, Date.now(), order, lane);
  return c.json(FarmClaimResponseSchema.parse({ jobs, leaseSeconds: LEASE_MS / 1000 }));
});

chessFarmRoutes.post("/complete", zJsonBody(FarmCompleteBodySchema), async (c) => {
  const { worker, id, result } = c.req.valid("json");
  const r = await completeJob(getDb(), worker, id, result);
  if (!r.ok) return errorResponse(c, r.status, r.message);
  return c.json(FarmOkSchema.parse({ ok: true }));
});

chessFarmRoutes.post("/fail", zJsonBody(FarmFailBodySchema), async (c) => {
  const { worker, id, error, retry, released, heavy } = c.req.valid("json");
  const r = await failJob(getDb(), worker, id, error, retry, Date.now(), released, heavy);
  if (!r.ok) return errorResponse(c, r.status, r.message);
  return c.json(FarmOkSchema.parse({ ok: true }));
});

chessFarmRoutes.post("/enqueue", zJsonBody(FarmEnqueueBodySchema), async (c) => {
  const { requestedBy, items } = c.req.valid("json");
  const { results } = await requestEvals(getDb(), requestedBy, BEST_MOVE_SPEC, items);
  const queued = items.filter((i) => !results[i.fen]).map((i) => i.fen);
  return c.json(FarmEnqueueResponseSchema.parse({ queued, known: results }));
});

chessFarmRoutes.get("/games", zQuery(FarmGamesQuerySchema), async (c) => {
  const { user, color, cursor } = c.req.valid("query");
  const page = await readGamesPage(getDb(), user, color, cursor);
  return c.json(
    FarmGamesPageSchema.parse({
      games: page.games.map((g) => ({ id: g.id, uci: g.uci, result: g.result })),
      next: page.next,
    }),
  );
});

chessFarmRoutes.get("/popular", zQuery(FarmPopularQuerySchema), async (c) => {
  const { fen } = c.req.valid("query");
  try {
    return c.json(FarmPopularResponseSchema.parse({ moves: await popularMoves(fen) }));
  } catch (err) {
    return errorResponse(c, 503, err instanceof Error ? err.message : "explorer unavailable");
  }
});

chessFarmRoutes.get("/status", async (c) => {
  return c.json(FarmStatusSchema.parse(await farmStats(getDb())));
});
