import { z } from "zod";
import { DateKeyStringSchema } from "./collection.ts";

// ── Domain ─────────────────────────────────────────────────────────────

export const AvailabilitySchema = z.enum(["can", "maybe"]);
export type Availability = z.infer<typeof AvailabilitySchema>;

// Map<DateKey, Availability> — used by both the user's own roster and the
// admin per-user fetch. The keys are plain strings on the wire (not branded)
// so consumer code can index with `record[date]` without casting.
export const AvailabilityMapSchema = z.record(z.string(), AvailabilitySchema);
export type AvailabilityMap = z.infer<typeof AvailabilityMapSchema>;

// `PUT /api/user/availability` — server caps at 200 entries.
export const PushAvailabilityBodySchema = AvailabilityMapSchema;
export type PushAvailabilityBody = z.input<typeof PushAvailabilityBodySchema>;

// ── Counts (everyone, per date) ────────────────────────────────────────

export const AvailabilityCountsSchema = z.record(
  z.string(),
  z.object({
    can: z.number().int().min(0),
    maybe: z.number().int().min(0),
  }),
);
export type AvailabilityCounts = z.infer<typeof AvailabilityCountsSchema>;

// ── Aggregate (admin: who marked what per date) ────────────────────────

export const AvailabilityEntrySchema = z.object({
  userId: z.string(),
  name: z.string(),
  status: AvailabilitySchema,
});
export type AvailabilityEntry = z.infer<typeof AvailabilityEntrySchema>;

export const AggregateAvailabilityMapSchema = z.record(
  z.string(),
  z.array(AvailabilityEntrySchema),
);
export type AggregateAvailabilityMap = z.infer<typeof AggregateAvailabilityMapSchema>;

// ── Away days (admin note on another member's calendar) ────────────────
// An admin's own reminder that a member is known to be unavailable on a day
// ("they saw the calendar and can't"). Never merged into availability and
// never shown to the member; its only computed effect is that such a day
// leaves the denominator of that member's coverage pie. A member's own
// can/maybe mark on the day wins over the note at read time.

/** `GET /api/admin/availability/away` — every member's away days from today on. */
export const AdminAwayDaysResponseSchema = z.object({
  awayByUser: z.record(z.string(), z.array(DateKeyStringSchema)),
});
export type AdminAwayDaysResponse = z.infer<typeof AdminAwayDaysResponseSchema>;

/** `PUT /api/admin/users/:id/away` body. */
export const SetAwayDayBodySchema = z.object({
  dateKey: DateKeyStringSchema,
  /** `true` notes the day as away; `false` clears the note. */
  away: z.boolean(),
});
export type SetAwayDayBody = z.infer<typeof SetAwayDayBodySchema>;

/** That member's remaining away days (today on) after the write. */
export const AwayDaysResponseSchema = z.object({
  days: z.array(DateKeyStringSchema),
});
export type AwayDaysResponse = z.infer<typeof AwayDaysResponseSchema>;
