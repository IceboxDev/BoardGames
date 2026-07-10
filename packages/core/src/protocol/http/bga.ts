import { z } from "zod";

/**
 * BGA bridge — spectate a live Board Game Arena table in our own UI.
 * (Unrelated to `bgg.ts`, which is BoardGameGeek catalog metadata.)
 *
 * A userscript (or any future producer) POSTs raw BGA events — one full
 * `gamedatas` snapshot plus every notification — to a token-gated ingest
 * route. The server is a dumb relay: payloads stay `z.unknown()` at the
 * envelope (per-game-payload convention) and are normalized client-side by
 * `@boardgames/core/games/7-wonders/bga` so format drift never breaks the
 * wire.
 */

export const BGA_SUPPORTED_GAMES = ["7-wonders"] as const;
export const BgaGameSchema = z.enum(BGA_SUPPORTED_GAMES);
export type BgaGame = z.infer<typeof BgaGameSchema>;

export const BgaSessionSchema = z.object({
  id: z.string().min(1),
  /** Human join code — possession grants read-only spectating (beamer pattern). */
  code: z.string().min(4).max(8),
  game: BgaGameSchema,
  createdAt: z.string(),
});
export type BgaSession = z.infer<typeof BgaSessionSchema>;

export const CreateBgaSessionRequestSchema = z.object({
  game: BgaGameSchema,
});
export type CreateBgaSessionRequest = z.infer<typeof CreateBgaSessionRequestSchema>;

/** The ingest token is returned only here, only to the owner. */
export const CreateBgaSessionResponseSchema = z.object({
  session: BgaSessionSchema,
  ingestToken: z.string().min(20),
});
export type CreateBgaSessionResponse = z.infer<typeof CreateBgaSessionResponseSchema>;

export const BgaSessionByCodeResponseSchema = z.object({
  session: BgaSessionSchema.nullable(),
});
export type BgaSessionByCodeResponse = z.infer<typeof BgaSessionByCodeResponseSchema>;

export const ActiveBgaSessionResponseSchema = z.object({
  session: BgaSessionSchema.nullable(),
});
export type ActiveBgaSessionResponse = z.infer<typeof ActiveBgaSessionResponseSchema>;

// ── Events ──────────────────────────────────────────────────────────────────

/** Serialized-payload size cap per event; `gamedatas` is the big one. */
export const BGA_EVENT_PAYLOAD_MAX = 1_500_000;
export const BGA_INGEST_MAX_EVENTS = 50;

export const BgaEventSchema = z.object({
  /** Producer-assigned, strictly increasing. The SSE `id:` field carries it. */
  seq: z.number().int().nonnegative(),
  /** "gamedatas" = full-state checkpoint (compacts the buffer); "notif" = incremental. */
  kind: z.enum(["gamedatas", "notif"]),
  payload: z.unknown(),
  /** Producer epoch ms. */
  ts: z.number(),
});
export type BgaEvent = z.infer<typeof BgaEventSchema>;

export const IngestBgaEventsRequestSchema = z.object({
  token: z.string().min(20).max(200),
  events: z.array(BgaEventSchema).min(1).max(BGA_INGEST_MAX_EVENTS),
});
export type IngestBgaEventsRequest = z.infer<typeof IngestBgaEventsRequestSchema>;

export const IngestBgaEventsResponseSchema = z.object({
  ok: z.literal(true),
  accepted: z.number().int().nonnegative(),
  /** Lets a restarted producer resync its counter (and detect a server reset). */
  nextSeq: z.number().int().nonnegative(),
});
export type IngestBgaEventsResponse = z.infer<typeof IngestBgaEventsResponseSchema>;

// ── SSE stream frames ───────────────────────────────────────────────────────

export const BgaStreamEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("connected"),
    session: BgaSessionSchema,
    lastSeq: z.number().int(),
  }),
  z.object({
    type: z.literal("event"),
    event: BgaEventSchema,
  }),
]);
export type BgaStreamEvent = z.infer<typeof BgaStreamEventSchema>;
