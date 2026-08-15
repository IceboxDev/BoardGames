import { z } from "zod";
import { MATCH_KINDS } from "./history.ts";

// Profile insight endpoints — the data behind the per-player match-history
// (`/u/:userId/matches`) and attendance (`/u/:userId/nights`) pages. Both
// responses are deliberately UNPAGINATED: a personal history is tiny (tens to
// low hundreds of rows) and every infographic on those pages (streaks, month
// buckets, co-player counts, filters) needs the full series anyway, so the
// server derives once and the client slices locally. Results are derived
// server-side with the same helpers the profile stats use (`groupMatchUnits`,
// `unitResult`, placement credit) — clients must never re-derive them.

// Inline (unbranded) primitives, same idiom as `history.ts`: inferred types
// stay plain `string` so they interop with existing history declarations.
const DateKeyStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const GameSlugStringSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,63}$/, "Expected kebab-case slug, max 64 chars");

// ── GET /api/profiles/:userId/match-summary ────────────────────────────

/**
 * One match UNIT (multi-session campaigns collapse into a single unit, like
 * the profile's `gamesPlayed`) in compact pre-derived form.
 */
export const ProfileMatchSummaryItemSchema = z.object({
  /** id of the unit's representative session in `match_results`. */
  matchId: z.number().int(),
  dateKey: DateKeyStringSchema.nullable(),
  /** Wall-clock sort key, same loose ISO format as `MatchRecord.playedAt`. */
  playedAt: z.string(),
  gameSlug: GameSlugStringSchema.nullable(),
  gameTitle: z.string().min(1).max(200),
  kind: z.enum(MATCH_KINDS),
  /** Unit result via `unitResult()` — campaign-aware, never re-derived client-side. */
  result: z.enum(["win", "loss", "draw", "moderator", "played"]),
  /** Scheme-A performance credit (0..1); null = non-competitive play. */
  credit: z.number().min(0).max(1).nullable(),
  /** 1-based finishing place + field size (FFA / last-standing); null otherwise. */
  place: z.number().int().min(1).nullable(),
  fieldSize: z.number().int().min(2).nullable(),
  /** Scored-coop team score (Just One); null otherwise. */
  score: z.number().int().nullable(),
  /** Campaign sessions collapsed into this unit (≥ 1). */
  sessions: z.number().int().min(1),
  /** Other participants of the representative session (self excluded). */
  coPlayerIds: z.array(z.string()),
});
export type ProfileMatchSummaryItem = z.infer<typeof ProfileMatchSummaryItemSchema>;

export const ProfileMatchSummaryResponseSchema = z.object({
  /** Newest first (by playedAt, then id — same ordering as the history feed). */
  items: z.array(ProfileMatchSummaryItemSchema),
  /** Display info for every id appearing in `coPlayerIds`. */
  players: z.record(z.string(), z.object({ name: z.string(), image: z.string().nullable() })),
});
export type ProfileMatchSummaryResponse = z.infer<typeof ProfileMatchSummaryResponseSchema>;

// ── GET /api/profiles/:userId/nights ───────────────────────────────────

/**
 * One past locked night with the user's retrospective attendance attribution
 * (`lib/nights-attended.ts` rule: played a recorded match that night, or
 * RSVP'd yes on a night that has no recorded matches at all). This is NOT the
 * calendar's forward-looking definite/tentative headcount — don't mix them.
 */
export const ProfileNightItemSchema = z.object({
  dateKey: DateKeyStringSchema,
  /** Night host; `userId` null when only a free-text host name was recorded. */
  host: z.object({ userId: z.string().nullable(), name: z.string() }).nullable(),
  address: z.string().nullable(),
  eventTime: z.string().nullable(),
  attended: z.boolean(),
  /** How credit was earned; null when not attended. */
  attendedVia: z.enum(["played", "rsvp"]).nullable(),
  rsvp: z.enum(["yes", "no"]).nullable(),
  /** `rsvps.auto` (auto-yes stamped at lock time); null when no RSVP row. */
  rsvpAuto: z.boolean().nullable(),
  matchesPlayedByUser: z.number().int().nonnegative(),
  totalMatches: z.number().int().nonnegative(),
});
export type ProfileNightItem = z.infer<typeof ProfileNightItemSchema>;

export const ProfileNightsResponseSchema = z.object({
  /** Every past locked night, newest first. */
  items: z.array(ProfileNightItemSchema),
});
export type ProfileNightsResponse = z.infer<typeof ProfileNightsResponseSchema>;
