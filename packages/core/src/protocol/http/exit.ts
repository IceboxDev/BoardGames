import { z } from "zod";
import { isExitGameSlug } from "../../games/exit-games.ts";
import { DateKeySchema } from "../common.ts";

// ── EXIT night narrowing vote ──────────────────────────────────────────
//
// When a sealed night's vote winner is the "exit" catalog anchor, the RSVP
// modal swaps in a second-stage vote over the individual EXIT boxes
// (`games/exit-games.ts`). This is deliberately separate from the first-stage
// `game_requests` reactions: box slugs must never leak into the night's
// hype/teach/learn ranking.

/** `GET /api/calendar/exit?date=YYYY-MM-DD` query. */
export const ExitNightQuerySchema = z.object({ date: DateKeySchema });
export type ExitNightQuery = z.infer<typeof ExitNightQuerySchema>;

/**
 * Second-stage state for one night. Keys are EXIT box slugs; values are user
 * ids. Keys stay unrefined strings on the read path so retiring a box from
 * `EXIT_GAMES` never makes a stored night unreadable — clients drop unknown
 * slugs on render.
 */
export const ExitNightStateSchema = z.object({
  /** Box slug → ids of expected guests who own that box. */
  owners: z.record(z.string(), z.array(z.string())),
  /** Box slug → ids of users who voted for it tonight. */
  votes: z.record(z.string(), z.array(z.string())),
});
export type ExitNightState = z.infer<typeof ExitNightStateSchema>;

/** `POST /api/calendar/exit/vote` body. The slug must name a real EXIT box. */
export const ExitVoteBodySchema = z.object({
  date: DateKeySchema,
  slug: z.string().refine(isExitGameSlug, { message: "Unknown EXIT box slug" }),
  on: z.boolean(),
});
export type ExitVoteBody = z.input<typeof ExitVoteBodySchema>;
