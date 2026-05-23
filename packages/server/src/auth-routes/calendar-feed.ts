// Session-authed CRUD for the personal iCalendar (ICS) token.
//
// All three routes sit under the existing `app.use("/api/calendar/*",
// requireAuth)` umbrella in server.ts, so we don't add new auth wiring here.
// The token is generated server-side, hashed via core's `hashFeedToken`
// (sha256 hex), and stored as `token_hash` in `calendar_feed_tokens`. The
// raw token is returned to the client exactly once (in the POST response)
// and never persisted.

import { hashFeedToken } from "@boardgames/core/ical/token";
import {
  CalendarFeedStatusSchema,
  CalendarFeedTokenResponseSchema,
  OkResponseSchema,
} from "@boardgames/core/protocol";
import { z } from "zod";
import { authedApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { generateRawToken } from "../lib/calendar-feed-token.ts";
import { parseRow } from "../lib/db-rows.ts";

/** `SELECT created_at FROM calendar_feed_tokens`. */
const CreatedAtRowSchema = z.object({ created_at: z.string() });

/** `SELECT created_at, last_accessed_at FROM calendar_feed_tokens`. */
const TokenStatusRowSchema = z.object({
  created_at: z.string(),
  last_accessed_at: z.string().nullable(),
});

export const calendarFeedRoutes = authedApp();

/**
 * Resolve the public API origin used when constructing the subscribe URL
 * returned to the client. In production the server is reachable directly at
 * the BETTER_AUTH_URL host; in dev we fall back to localhost:3001.
 */
function apiOrigin(): string {
  const raw = process.env.BETTER_AUTH_URL?.trim().replace(/\/+$/, "");
  if (!raw) return "http://localhost:3001";
  if (/^https?:\/\//.test(raw)) return raw;
  return `https://${raw}`;
}

function buildSubscribeUrls(rawToken: string): {
  subscribeUrl: string;
  webcalUrl: string;
} {
  const origin = apiOrigin();
  const path = `/api/ical/feed/${rawToken}/calendar.ics`;
  return {
    subscribeUrl: `${origin}${path}`,
    webcalUrl: `${origin.replace(/^https?:\/\//, "webcal://")}${path}`,
  };
}

/**
 * POST /api/calendar/feed/token — mint a token for the viewer. If one
 * already exists this is a rotation: the old row is deleted and a new one
 * inserted in a single batch so an in-flight subscriber sees one consistent
 * state. Returns the raw token + ready-to-paste subscribe URLs.
 */
calendarFeedRoutes.post("/feed/token", async (c) => {
  const user = c.get("user");
  const rawToken = generateRawToken();
  const tokenHash = await hashFeedToken(rawToken);

  // Atomic rotate-or-insert. UPSERT on user_id PK is simpler than
  // DELETE+INSERT and protects against a concurrent regenerate race —
  // SQLite serializes the batch, so two clicks land one final row.
  await getDb().execute({
    sql: `INSERT INTO calendar_feed_tokens
            (user_id, token_hash, created_at, last_accessed_at, last_user_agent)
          VALUES (?, ?, datetime('now'), NULL, NULL)
          ON CONFLICT(user_id) DO UPDATE SET
            token_hash = excluded.token_hash,
            created_at = excluded.created_at,
            last_accessed_at = NULL,
            last_user_agent = NULL`,
    args: [user.id, tokenHash],
  });

  // Read back the created_at so we can return it to the client without
  // assuming a local clock. SQLite's datetime('now') is UTC-ish.
  const readback = await getDb().execute({
    sql: "SELECT created_at FROM calendar_feed_tokens WHERE user_id = ? LIMIT 1",
    args: [user.id],
  });
  const createdAt = readback.rows[0]
    ? parseRow(CreatedAtRowSchema, readback.rows[0], "calendar_feed_tokens").created_at
    : "";

  const { subscribeUrl, webcalUrl } = buildSubscribeUrls(rawToken);
  return c.json(
    CalendarFeedTokenResponseSchema.parse({
      token: rawToken,
      subscribeUrl,
      webcalUrl,
      createdAt,
    }),
  );
});

/**
 * DELETE /api/calendar/feed/token — disconnect. Hard-delete; idempotent.
 * Returns Ok even when no row existed (so a stale UI clicking Disconnect
 * twice doesn't surface an error).
 */
calendarFeedRoutes.delete("/feed/token", async (c) => {
  const user = c.get("user");
  await getDb().execute({
    sql: "DELETE FROM calendar_feed_tokens WHERE user_id = ?",
    args: [user.id],
  });
  return c.json(OkResponseSchema.parse({ ok: true }));
});

/**
 * GET /api/calendar/feed/status — non-secret state for the modal. Drives
 * the three render states (never-connected / connected-no-token /
 * just-rotated) without ever exposing the raw token.
 */
calendarFeedRoutes.get("/feed/status", async (c) => {
  const user = c.get("user");
  const { rows } = await getDb().execute({
    sql: `SELECT created_at, last_accessed_at FROM calendar_feed_tokens
          WHERE user_id = ? LIMIT 1`,
    args: [user.id],
  });
  const row = rows[0] ? parseRow(TokenStatusRowSchema, rows[0], "calendar_feed_tokens") : null;
  return c.json(
    CalendarFeedStatusSchema.parse({
      connected: row !== null,
      createdAt: row?.created_at ?? null,
      lastAccessedAt: row?.last_accessed_at ?? null,
    }),
  );
});
