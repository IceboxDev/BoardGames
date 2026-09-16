import { z } from "zod";

// ── Branded primitives ─────────────────────────────────────────────────
// Branded strings stop callers passing arbitrary strings where a wire-format
// constraint exists. They cost nothing at runtime beyond the regex check.

export const DateKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .brand<"DateKey">();
export type DateKey = z.infer<typeof DateKeySchema>;

// ── Night keys ─────────────────────────────────────────────────────────
//
// A locked night is identified by its date key — and a date may carry TWO
// nights (an open club night and a private table, say). The second one is
// keyed `YYYY-MM-DD_2`: every table, route, query key, deep link and
// activity row that already keys a night by its date string keeps working
// unchanged, and only code that reads the key AS A DATE (availability
// joins, iCalendar start times, day formatting) has to go through
// `nightDate()`. The suffix sorts after its date and before the next one, so
// lexical range scans (`date_key >= today`) still order nights correctly.

/** Second night on a date: `YYYY-MM-DD` + this suffix. */
export const SECOND_NIGHT_SUFFIX = "_2";
/** How many nights one calendar date may carry. */
export const MAX_NIGHTS_PER_DATE = 2;
const NIGHT_KEY_RE = /^\d{4}-\d{2}-\d{2}(?:_2)?$/;

export const NightKeySchema = z
  .string()
  .regex(NIGHT_KEY_RE, "Expected YYYY-MM-DD or YYYY-MM-DD_2")
  .brand<"NightKey">();
export type NightKey = z.infer<typeof NightKeySchema>;

/**
 * Unbranded twin of {@link NightKeySchema} for response shapes whose types
 * deliberately stay plain strings (history, profile, agent payloads).
 */
export const NightKeyStringSchema = z
  .string()
  .regex(NIGHT_KEY_RE, "Expected YYYY-MM-DD or YYYY-MM-DD_2");

/** The calendar date a night key falls on (`2026-09-20_2` → `2026-09-20`). */
export function nightDate(key: string): string {
  return key.slice(0, 10);
}

/** Which of the date's nights a key names: 1 (the plain date) or 2. */
export function nightSlot(key: string): 1 | 2 {
  return key.endsWith(SECOND_NIGHT_SUFFIX) ? 2 : 1;
}

/** The key of slot `slot` on `date`. */
export function nightKeyFor(date: string, slot: 1 | 2): string {
  return slot === 2 ? `${date}${SECOND_NIGHT_SUFFIX}` : date;
}

/** Every key a date can carry, first slot first. */
export function nightKeysOf(date: string): [string, string] {
  return [date, `${date}${SECOND_NIGHT_SUFFIX}`];
}

export const IsoTimestampSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/,
    "Expected ISO-8601 timestamp",
  )
  .brand<"IsoTimestamp">();
export type IsoTimestamp = z.infer<typeof IsoTimestampSchema>;

export const TimeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM (24h)")
  .brand<"TimeOfDay">();
export type TimeOfDay = z.infer<typeof TimeOfDaySchema>;

export const GameSlugSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,63}$/, "Expected kebab-case slug, max 64 chars");
export type GameSlug = z.infer<typeof GameSlugSchema>;

// ── Error envelope ─────────────────────────────────────────────────────
// Every server error response serializes through this. Keeping the shape
// frozen here means client-side `ApiError` extraction is one place, not 22.

export const ErrorResponseSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
