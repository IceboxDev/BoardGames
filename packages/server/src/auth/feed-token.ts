// Path-token authentication for the public iCalendar feed. Calendar clients
// (Google's servers, Apple's daemons, Outlook's pollers) hit
// `/api/ical/feed/:token/calendar.ics` WITHOUT a session cookie — the
// token in the path IS the credential.
//
// On miss we return 404 (not 401) for two reasons:
//   - 401 prompts browsers for credentials, and feed URLs sometimes get
//     pasted into a browser by curious users; we don't want a login dialog.
//   - 404 is also harder to use as an existence oracle than 401.
//
// We never log the raw token. Every message that could contain it routes
// through `redactToken` from core/ical/token. The middleware accepts the
// token shape via regex before touching the DB, so a shape mismatch costs
// zero database round-trips.

import { hashFeedToken, redactToken } from "@boardgames/core/ical/token";
import { CalendarFeedTokenSchema } from "@boardgames/core/protocol";
import type { MiddlewareHandler } from "hono";
import { z } from "zod";
import { getDb } from "../db.ts";
import { parseRow } from "../lib/db-rows.ts";
import type { FeedEnv } from "./types.ts";

/** `SELECT user_id FROM calendar_feed_tokens WHERE token_hash = ?`. */
const FeedTokenRowSchema = z.object({ user_id: z.string() });

export const requireFeedToken: MiddlewareHandler<FeedEnv> = async (c, next) => {
  const raw = c.req.param("token");
  if (!raw) return c.text("Not found.", 404);

  // Shape-validate before hashing. Cheap pre-filter that turns most invalid
  // requests (typos, link-rot, scanners) into a 404 with no DB work and no
  // log line that could ever contain a real token.
  const parsed = CalendarFeedTokenSchema.safeParse(raw);
  if (!parsed.success) return c.text("Not found.", 404);

  const tokenHash = await hashFeedToken(raw);
  const { rows } = await getDb().execute({
    sql: "SELECT user_id FROM calendar_feed_tokens WHERE token_hash = ? LIMIT 1",
    args: [tokenHash],
  });
  const row = rows[0];
  if (!row) return c.text("Not found.", 404);

  const { user_id: feedUserId } = parseRow(FeedTokenRowSchema, row, "calendar_feed_tokens");
  c.set("feedUserId", feedUserId);

  // Fire-and-forget access telemetry. Truncating UA to 200 chars caps
  // storage growth. Errors are redacted in case the path slipped into the
  // exception text somehow (Hono shouldn't, but defense in depth).
  const ua = c.req.header("user-agent")?.slice(0, 200) ?? null;
  void getDb()
    .execute({
      sql: `UPDATE calendar_feed_tokens
            SET last_accessed_at = datetime('now'),
                last_user_agent = ?
            WHERE user_id = ?`,
      args: [ua, feedUserId],
    })
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[ical-feed] access-update failed: ${redactToken(msg)}`);
    });

  return next();
};
