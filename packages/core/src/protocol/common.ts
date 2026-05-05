import { z } from "zod";

// ── Branded primitives ─────────────────────────────────────────────────
// Branded strings stop callers passing arbitrary strings where a wire-format
// constraint exists. They cost nothing at runtime beyond the regex check.

export const DateKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .brand<"DateKey">();
export type DateKey = z.infer<typeof DateKeySchema>;

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
