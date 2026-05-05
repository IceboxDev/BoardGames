import { z } from "zod";
import { DateKeySchema, TimeOfDaySchema } from "../common.ts";

// ── Domain schemas ─────────────────────────────────────────────────────

export const RsvpStatusSchema = z.enum(["yes", "no"]);
export type RsvpStatus = z.infer<typeof RsvpStatusSchema>;

export const LockHostSchema = z.object({
  userId: z.string(),
  name: z.string(),
});
export type LockHost = z.infer<typeof LockHostSchema>;

// `lockedAt` and `picksLockedAt` are server-side SQLite datetime strings
// ("YYYY-MM-DD HH:MM:SS") — NOT branded as IsoTimestamp because the
// optimistic client builder uses `new Date().toISOString()` and the formats
// don't match. They're opaque server-issued tokens for display only.
export const LockedDateSchema = z.object({
  lockedBy: z.string(),
  lockedAt: z.string(),
  expectedUserIds: z.array(z.string()),
  rsvps: z.record(z.string(), RsvpStatusSchema),
  host: LockHostSchema.nullable(),
  eventTime: TimeOfDaySchema.nullable(),
  address: z.string().nullable(),
  picksLockedAt: z.string().nullable(),
  attendance: z.object({
    definite: z.number().int().min(0),
    tentative: z.number().int().min(0),
  }),
});
export type LockedDate = z.infer<typeof LockedDateSchema>;

export const CalendarLocksSchema = z.record(z.string(), LockedDateSchema);
export type CalendarLocks = z.infer<typeof CalendarLocksSchema>;

// ── Request bodies ─────────────────────────────────────────────────────

/**
 * Wire body for `POST /api/admin/calendar/lock`. Includes the date.
 */
export const LockInRequestBodySchema = z.object({
  date: DateKeySchema,
  hostUserId: z.string().nullable().optional(),
  hostName: z.string().nullable().optional(),
  eventTime: TimeOfDaySchema.nullable().optional(),
  address: z.string().max(500).nullable().optional(),
});
export type LockInRequestBody = z.input<typeof LockInRequestBodySchema>;

/**
 * Subset of {@link LockInRequestBodySchema} used by the lock-in modal — the
 * date comes from the surrounding context, not the form. Exposed as the
 * `z.input` shape so React form callers can pass raw strings for branded
 * fields (the schema brands them on the way to the wire).
 */
export const LockInFormSchema = LockInRequestBodySchema.omit({ date: true });
export type LockInForm = z.input<typeof LockInFormSchema>;

export const UnlockBodySchema = z.object({ date: DateKeySchema });
export type UnlockBody = z.infer<typeof UnlockBodySchema>;

export const PicksLockBodySchema = z.object({
  date: DateKeySchema,
  on: z.boolean(),
});
export type PicksLockBody = z.infer<typeof PicksLockBodySchema>;

export const SetRsvpBodySchema = z.object({
  date: DateKeySchema,
  status: RsvpStatusSchema,
  /**
   * True when the call originates from an automated mechanism (lock-time
   * cans-snapshot batch on the server, or the modal's first-open useEffect
   * on the client) rather than an explicit button click. Defaults to false
   * so manual callers don't need to set anything.
   */
  auto: z.boolean().optional(),
});
export type SetRsvpBody = z.input<typeof SetRsvpBodySchema>;

export const ClearRsvpBodySchema = z.object({ date: DateKeySchema });
export type ClearRsvpBody = z.infer<typeof ClearRsvpBodySchema>;

// ── Available games (per-date pick screen) ─────────────────────────────

export const ReactionKindSchema = z.enum(["hype", "teach", "learn"]);
export type ReactionKind = z.infer<typeof ReactionKindSchema>;

export const ReactionAggregateSchema = z.object({
  hype: z.number().int().min(0),
  teach: z.number().int().min(0),
  learn: z.number().int().min(0),
  /** Reactions the current viewer has set on this game. */
  viewer: z.array(ReactionKindSchema),
});
export type ReactionAggregate = z.infer<typeof ReactionAggregateSchema>;

export const AttendeeStatusSchema = z.enum(["definite", "tentative"]);
export type AttendeeStatus = z.infer<typeof AttendeeStatusSchema>;

export const AttendeeSchema = z.object({
  userId: z.string(),
  name: z.string(),
  isHost: z.boolean(),
  status: AttendeeStatusSchema,
  /**
   * True when the user has explicitly clicked yes in the RSVP modal (or was
   * auto-confirmed at lock-in via the cans-snapshot batch). False means
   * they're inferred into the attendee list purely from their `can`/`maybe`
   * availability — useful for the "who do I still need to ping?" view.
   * Default false on older payloads to keep cached responses parseable.
   */
  hasRsvped: z.boolean().default(false),
  votes: z.object({
    hype: z.number().int().min(0),
    teach: z.number().int().min(0),
    learn: z.number().int().min(0),
  }),
  /**
   * Slugs this user should bring on the night. Host: every top-5 they own
   * (no per-user limit). Non-host: at most 3 from the top-5 set.
   */
  bringing: z.array(z.string()),
});
export type Attendee = z.infer<typeof AttendeeSchema>;

export const AvailableGamesSchema = z.object({
  ownedSlugs: z.array(z.string()),
  /** Confirmed attendees: (availability:can ∪ rsvp:yes) − rsvp:no. */
  definiteCount: z.number().int().min(0),
  /** Maybes who haven't RSVP'd — widen the player-count upper bound only. */
  tentativeCount: z.number().int().min(0),
  /** Same as definite — kept for callers that want the id list. */
  participantIds: z.array(z.string()),
  /** Per-game reaction counts plus the viewer's own active reactions. */
  reactions: z.record(z.string(), ReactionAggregateSchema),
  /** Up to 5 slugs, ranked by hype with support tie-break. */
  topSlugs: z.array(z.string()),
  /** All attendees (definite + tentative), pre-sorted host-first then by votes. */
  attendees: z.array(AttendeeSchema),
  /** Mirror of the lock's picks_locked_at — present here for the modal too. */
  picksLockedAt: z.string().nullable().optional(),
});
export type AvailableGames = z.infer<typeof AvailableGamesSchema>;

export const AvailableGamesQuerySchema = z.object({ date: DateKeySchema });
export type AvailableGamesQuery = z.infer<typeof AvailableGamesQuerySchema>;

export const GameReactionBodySchema = z.object({
  date: DateKeySchema,
  slug: z.string().min(1),
  reaction: ReactionKindSchema,
  on: z.boolean(),
});
export type GameReactionBody = z.infer<typeof GameReactionBodySchema>;

// ── Response shapes ────────────────────────────────────────────────────

export const OkResponseSchema = z.object({ ok: z.literal(true) });
export type OkResponse = z.infer<typeof OkResponseSchema>;

export const LockInResponseSchema = z.object({
  ok: z.literal(true),
  expectedUserIds: z.array(z.string()),
});
export type LockInResponse = z.infer<typeof LockInResponseSchema>;

// ── Optimistic helpers ─────────────────────────────────────────────────

/**
 * Build a `LockedDate` for a React-Query optimistic update. Co-located with
 * the schema so that any new field added to `LockedDateSchema` forces a
 * compile error here. Trust the shape (no runtime validation on optimistic
 * data — we built it from typed inputs).
 */
export function mkOptimisticLock(
  form: LockInForm,
  existing: LockedDate | undefined,
  fallbackLockedBy: string,
): LockedDate {
  // Brand-wrap the `eventTime` raw input via the schema so the LockedDate's
  // branded field stays sound. Optimistic write only — no validation cost
  // beyond the regex check.
  const eventTime = form.eventTime ?? null;
  return {
    lockedBy: existing?.lockedBy ?? fallbackLockedBy,
    lockedAt: new Date().toISOString(),
    expectedUserIds: existing?.expectedUserIds ?? [],
    rsvps: existing?.rsvps ?? {},
    host: form.hostUserId ? { userId: form.hostUserId, name: form.hostName ?? "" } : null,
    eventTime: eventTime ? TimeOfDaySchema.parse(eventTime) : null,
    address: form.address ?? null,
    picksLockedAt: existing?.picksLockedAt ?? null,
    attendance: existing?.attendance ?? { definite: 0, tentative: 0 },
  };
}
