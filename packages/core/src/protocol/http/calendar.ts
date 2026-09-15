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

// ── Private nights ─────────────────────────────────────────────────────
//
// A private night is locked FOR a host with a fixed number of seats and a
// hand-picked invitee list (stored as the lock's expected set). Invitees fill
// the seats first-come-first-served; the overflow is a waitlist that promotes
// automatically. Outsiders get a redacted lock (see `LockedDateSchema`).

/** Who decides the games: the host alone, or the seated group voting as usual. */
export const PickModeSchema = z.enum(["group", "host"]);
export type PickMode = z.infer<typeof PickModeSchema>;

/** Seat tally of a private night. `total` includes the host's own seat. */
export const NightSeatsSchema = z.object({
  total: z.number().int().min(1),
  taken: z.number().int().min(0),
  waitlisted: z.number().int().min(0),
});
export type NightSeats = z.infer<typeof NightSeatsSchema>;

/** A participant's relationship to a private night's seats. */
export const SeatStateSchema = z.enum(["host", "seated", "waitlisted", "invited", "declined"]);
export type SeatState = z.infer<typeof SeatStateSchema>;

/** Hard bounds for a private night's seat count (host included). */
export const MIN_SEAT_COUNT = 2;
export const MAX_SEAT_COUNT = 20;
/** Upper bound for a lock-in / update invitee list. */
export const MAX_INVITEES = 50;
/** Max length of a private night's optional title. */
export const MAX_NIGHT_TITLE = 80;

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
  /**
   * True when the host is hosting at the same location as their game
   * collection — the host then has no per-person bringing cap (they show up
   * with everything). False when the night is at a different location; the
   * host falls back to the regular 3-game cap like anyone else. Defaults to
   * true on the wire so legacy rows without the column preserve historical
   * behavior. Older cached payloads (pre-flag) parse cleanly via the
   * default.
   */
  hostAtHome: z.boolean().default(true),
  attendance: z.object({
    definite: z.number().int().min(0),
    tentative: z.number().int().min(0),
  }),
  /**
   * Slug of the vote-winning game for this night (the per-date games
   * payload's `topSlugs[0]`), or null when nothing playable has been hyped
   * yet. Computed server-side with the shared ranking so the calendar grid
   * can light up special-night treatments — notably the Dungeons & Dragons
   * night card — without fetching the full per-date payload for every cell.
   * Defaults to null so older cached lock payloads parse cleanly.
   */
  topGameSlug: z.string().nullable().default(null),
  /**
   * Private night: invitation-only, seat-capped, host-curated. Every field
   * below is defaulted so lock payloads from before private nights parse.
   */
  isPrivate: z.boolean().default(false),
  /** Optional label the host gives the night ("TI4 marathon"). Participants only. */
  title: z.string().nullable().default(null),
  pickMode: PickModeSchema.default("group"),
  /** Seat tally — null on open nights. Visible to outsiders too. */
  seats: NightSeatsSchema.nullable().default(null),
  /** Seated participants, host first, in seating order. Participants only. */
  seatedUserIds: z.array(z.string()).default([]),
  /** Overflow "yes" RSVPs in queue order. Participants only. */
  waitlistUserIds: z.array(z.string()).default([]),
  /**
   * True when the server stripped this lock for a viewer who is neither
   * invited nor admin: `rsvps`, `expectedUserIds`, `seatedUserIds`,
   * `waitlistUserIds` are empty, `title`/`eventTime`/`address`/`topGameSlug`
   * are null, and only the host + seat tally remain. The client renders the
   * peek panel instead of the RSVP modal.
   */
  redacted: z.boolean().default(false),
});
export type LockedDate = z.infer<typeof LockedDateSchema>;

export const CalendarLocksSchema = z.record(z.string(), LockedDateSchema);

// Per-user hosting stats for the lock-in host picker: total nights hosted and
// the most recent date (YYYY-MM-DD, null if never). Keyed by userId.
export const HostStatsSchema = z.object({
  totalHosts: z.number().int().min(0),
  lastHostedDate: z.string().nullable(),
});
export type HostStats = z.infer<typeof HostStatsSchema>;

export const HostStatsMapSchema = z.record(z.string(), HostStatsSchema);
export type HostStatsMap = z.infer<typeof HostStatsMapSchema>;
export type CalendarLocks = z.infer<typeof CalendarLocksSchema>;

// ── Request bodies ─────────────────────────────────────────────────────

/**
 * Fields shared by the wire body and the modal form. Kept as a plain shape so
 * both schemas can carry the same `superRefine` — refinements do not survive
 * `.omit()`, which is how the form schema used to be derived.
 */
const lockInFields = {
  hostUserId: z.string().nullable().optional(),
  hostName: z.string().nullable().optional(),
  eventTime: TimeOfDaySchema.nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  /**
   * Whether the host is hosting at the same location as their game
   * collection. Omit (or send null) to leave the flag unset on the server —
   * the read path treats unset as `true` for backwards compat with rows
   * locked before this flag existed.
   */
  hostAtHome: z.boolean().nullable().optional(),
  /**
   * Private night. Requires a host and a seat count; `inviteeIds` is the
   * guest list (the host is added implicitly). On an edit, an omitted
   * `inviteeIds` keeps the current list and a present one replaces it.
   */
  isPrivate: z.boolean().optional(),
  seatCount: z.number().int().min(MIN_SEAT_COUNT).max(MAX_SEAT_COUNT).nullable().optional(),
  inviteeIds: z.array(z.string().min(1)).max(MAX_INVITEES).optional(),
  pickMode: PickModeSchema.optional(),
  title: z.string().trim().max(MAX_NIGHT_TITLE).nullable().optional(),
};

function refinePrivateLockIn(
  val: { isPrivate?: boolean; hostUserId?: string | null; seatCount?: number | null },
  ctx: z.RefinementCtx,
): void {
  if (!val.isPrivate) return;
  if (!val.hostUserId) {
    ctx.addIssue({ code: "custom", path: ["hostUserId"], message: "A private night needs a host" });
  }
  if (val.seatCount === null || val.seatCount === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["seatCount"],
      message: "A private night needs a seat count",
    });
  }
}

/**
 * Wire body for `POST /api/admin/calendar/lock`. Includes the date.
 */
export const LockInRequestBodySchema = z
  .object({ date: DateKeySchema, ...lockInFields })
  .superRefine(refinePrivateLockIn);
export type LockInRequestBody = z.input<typeof LockInRequestBodySchema>;

/**
 * Subset of {@link LockInRequestBodySchema} used by the lock-in modal — the
 * date comes from the surrounding context, not the form. Exposed as the
 * `z.input` shape so React form callers can pass raw strings for branded
 * fields (the schema brands them on the way to the wire).
 */
export const LockInFormSchema = z.object(lockInFields).superRefine(refinePrivateLockIn);
export type LockInForm = z.input<typeof LockInFormSchema>;

/**
 * `POST /api/calendar/private-night` — host or admin adjusts a private night
 * after lock-in. Every field is optional; the server applies what is present
 * in one batch. Removing an invitee also drops their RSVP and votes.
 */
export const PrivateNightUpdateBodySchema = z.object({
  date: DateKeySchema,
  seatCount: z.number().int().min(MIN_SEAT_COUNT).max(MAX_SEAT_COUNT).optional(),
  pickMode: PickModeSchema.optional(),
  title: z.string().trim().max(MAX_NIGHT_TITLE).nullable().optional(),
  addInviteeIds: z.array(z.string().min(1)).max(MAX_INVITEES).optional(),
  removeInviteeIds: z.array(z.string().min(1)).max(MAX_INVITEES).optional(),
});
export type PrivateNightUpdateBody = z.input<typeof PrivateNightUpdateBodySchema>;

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

/**
 * Host/admin-only: force another user's RSVP for `date` to "no". Used by the
 * attendees view's X button to remove someone from the guest list when they
 * back out by text/voice rather than touching the app themselves.
 */
export const KickRsvpBodySchema = z.object({
  date: DateKeySchema,
  userId: z.string().min(1),
});
export type KickRsvpBody = z.infer<typeof KickRsvpBodySchema>;

/**
 * `POST /api/admin/calendar/night-guest` — admin-only: add (`on: true`) or
 * remove (`on: false`) a guest player on a locked night. Guests are stub
 * accounts that can't sign in, so an admin RSVPs on their behalf: adding
 * upserts an RSVP "yes" (joining them to the attendee list through the
 * normal pipeline), removing deletes the row. Only works for users with the
 * guest flag — real members manage their own RSVPs.
 */
export const AdminNightGuestBodySchema = z.object({
  date: DateKeySchema,
  guestUserId: z.string().min(1),
  on: z.boolean(),
});
export type AdminNightGuestBody = z.infer<typeof AdminNightGuestBodySchema>;

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
  /**
   * True when this attendee is an app admin. The D&D-night panel uses it to
   * crown the Dungeon Master (the admin runs the table; the host takes over
   * only when no admin is in the party). Default false so legacy payloads
   * parse.
   */
  isAdmin: z.boolean().default(false),
  status: AttendeeStatusSchema,
  /**
   * True when the user has explicitly clicked yes in the RSVP modal (or was
   * auto-confirmed at lock-in via the cans-snapshot batch). False means
   * they're inferred into the attendee list purely from their `can`/`maybe`
   * availability — useful for the "who do I still need to ping?" view.
   * Default false on older payloads to keep cached responses parseable.
   */
  hasRsvped: z.boolean().default(false),
  /**
   * True when this attendee is a guest stub (no login) added to the night by
   * an admin. The attendees view badges them so the table knows who's a
   * plus-one. Default false so legacy payloads parse.
   */
  isGuest: z.boolean().default(false),
  /**
   * The user's avatar (`user.image`, a small webp data URI) and profile
   * accent, so attendee rosters can show real faces instead of initials
   * monograms. Optional: absent on legacy payloads, null when the user has
   * neither. `<Avatar>` falls back to the monogram either way.
   */
  image: z.string().nullable().optional(),
  accentHex: z.string().nullable().optional(),
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
  /**
   * Private nights only: where this person stands on the seat list. Null on
   * open nights (and on payloads from before private nights existed).
   */
  seat: SeatStateSchema.nullable().default(null),
});
export type Attendee = z.infer<typeof AttendeeSchema>;

export const AvailableGamesSchema = z.object({
  ownedSlugs: z.array(z.string()),
  /**
   * The subset of `ownedSlugs` that is new to at least one attending owner
   * (a dated, unplayed copy on the table) — the picker's New frame. Defaulted
   * so a persisted payload from before the field parses.
   */
  newSlugs: z.array(z.string()).default([]),
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
  /** Private-night mirror of the lock — defaulted for pre-feature payloads. */
  isPrivate: z.boolean().default(false),
  pickMode: PickModeSchema.default("group"),
  seatCount: z.number().int().min(1).nullable().default(null),
  /**
   * The headcount window games must cover. Open nights: [definite,
   * definite + tentative] — derivable from the counts above, so null. Private
   * nights: [seatCount, seatCount] — the host plans for the table they set,
   * not for whoever has answered so far.
   */
  playerWindow: z
    .object({ lo: z.number().int().min(0), hi: z.number().int().min(0) })
    .nullable()
    .default(null),
  /**
   * Whether the viewer's reactions count on this night: everyone on an open
   * night, the host alone in host-pick mode, seated players in group mode.
   * Admins always can. Defaulted true for pre-feature payloads.
   */
  viewerCanReact: z.boolean().default(true),
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
  // hostAtHome precedence: explicit form value (incl. false) > existing > true.
  // The form's `null` means "no opinion" — fall through to the existing row's
  // value, or the historical default of true if nothing's there yet.
  const hostAtHome =
    form.hostAtHome === true || form.hostAtHome === false
      ? form.hostAtHome
      : (existing?.hostAtHome ?? true);
  // Private night: the form's flag wins, then the existing row. The guest
  // list is host + invitees when the form carries one, else whatever the
  // row already had; the host holds seat 1 from the first paint.
  const isPrivate = form.isPrivate ?? existing?.isPrivate ?? false;
  const hostUserId = form.hostUserId ?? null;
  const expectedUserIds =
    isPrivate && form.inviteeIds
      ? [...new Set([...(hostUserId ? [hostUserId] : []), ...form.inviteeIds])]
      : (existing?.expectedUserIds ?? []);
  const seatTotal = isPrivate ? (form.seatCount ?? existing?.seats?.total ?? MIN_SEAT_COUNT) : null;
  const seatedUserIds = isPrivate
    ? (existing?.seatedUserIds ?? (hostUserId ? [hostUserId] : []))
    : [];
  const waitlistUserIds = isPrivate ? (existing?.waitlistUserIds ?? []) : [];
  const seats =
    seatTotal === null
      ? null
      : { total: seatTotal, taken: seatedUserIds.length, waitlisted: waitlistUserIds.length };
  return {
    lockedBy: existing?.lockedBy ?? fallbackLockedBy,
    lockedAt: new Date().toISOString(),
    expectedUserIds,
    rsvps: existing?.rsvps ?? {},
    host: form.hostUserId ? { userId: form.hostUserId, name: form.hostName ?? "" } : null,
    eventTime: eventTime ? TimeOfDaySchema.parse(eventTime) : null,
    address: form.address ?? null,
    picksLockedAt: existing?.picksLockedAt ?? null,
    hostAtHome,
    attendance: existing?.attendance ?? { definite: 0, tentative: 0 },
    // Locking a date doesn't change the vote winner — carry the existing
    // value (a fresh lock has none yet; the server recomputes on next read).
    topGameSlug: existing?.topGameSlug ?? null,
    isPrivate,
    title: isPrivate ? (form.title ?? existing?.title ?? null) : null,
    pickMode: form.pickMode ?? existing?.pickMode ?? "group",
    seats,
    seatedUserIds,
    waitlistUserIds,
    // The admin locking the night is never an outsider to it.
    redacted: false,
  };
}
