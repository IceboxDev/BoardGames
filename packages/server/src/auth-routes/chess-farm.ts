// Chess analysis farm — `/api/chess-farm/*`, for the worker on ws21.
//
//   POST /claim     lease up to `max` jobs (highest reach first)
//   POST /complete  store a job's result (validated against the position)
//   POST /fail      give a job back (retry) or mark it failed
//   GET  /status    queue counts
//
// Not a browser surface: the worker authenticates with `Authorization:
// Bearer $CHESS_FARM_TOKEN` (no cookie), so it sits outside requireAuth like
// the BGA ingest. Without the env var the farm is off (503).

import { timingSafeEqual } from "node:crypto";
import {
  FarmClaimBodySchema,
  FarmClaimResponseSchema,
  FarmCompleteBodySchema,
  FarmFailBodySchema,
  FarmOkSchema,
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
} from "../lib/chess-trainer/farm-store.ts";
import { errorResponse, zJsonBody } from "../lib/error-response.ts";

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
  const { worker, max } = c.req.valid("json");
  const jobs = await claimJobs(getDb(), worker, max);
  return c.json(FarmClaimResponseSchema.parse({ jobs, leaseSeconds: LEASE_MS / 1000 }));
});

chessFarmRoutes.post("/complete", zJsonBody(FarmCompleteBodySchema), async (c) => {
  const { worker, id, result } = c.req.valid("json");
  const r = await completeJob(getDb(), worker, id, result);
  if (!r.ok) return errorResponse(c, r.status, r.message);
  return c.json(FarmOkSchema.parse({ ok: true }));
});

chessFarmRoutes.post("/fail", zJsonBody(FarmFailBodySchema), async (c) => {
  const { worker, id, error, retry } = c.req.valid("json");
  const r = await failJob(getDb(), worker, id, error, retry);
  if (!r.ok) return errorResponse(c, r.status, r.message);
  return c.json(FarmOkSchema.parse({ ok: true }));
});

chessFarmRoutes.get("/status", async (c) => {
  return c.json(FarmStatusSchema.parse(await farmStats(getDb())));
});
