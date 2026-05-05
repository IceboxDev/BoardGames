import { z } from "zod";

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
