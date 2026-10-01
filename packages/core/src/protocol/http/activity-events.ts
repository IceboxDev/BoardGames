import { z } from "zod";
import { NightKeyStringSchema } from "../common.ts";
import { GreetingAckActionSchema } from "./greetings.ts";

// ── Member activity vocabulary ─────────────────────────────────────────
//
// The ONE definition of what the activity trail can record: every event
// `type`, the shape of its `meta`, and the pages a page-view beacon can name.
//
// - The server's `logActivity(type, meta)` is typed from `ActivityMetaInput`,
//   so a call site cannot log a type that isn't here or a meta that doesn't
//   match it.
// - The admin drawer's label registry is a `Record<ActivityType, …>`, so a type
//   added here without a label fails the web typecheck instead of shipping as
//   a raw id ("geography train").
//
// The wire envelope (`ActivityEntrySchema`) keeps `type: string` and
// `meta: record` on purpose: web (Vercel) and server (Railway) deploy
// separately, so a client can meet a type it doesn't know yet. It narrows each
// row with `parseActivityMeta`, which degrades a bad field instead of the row.
//
// Rows are never rewritten. A meta shape that changes keeps its old fields
// here as optional "legacy" members, so years-old rows still render.

/** A calendar day. */
const DateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** A night: a date, or `date_2` for the second night on it — see `nightDate()`. */
const Night = NightKeyStringSchema;
const On = z.boolean();

/** One changed setting: the stored value before and after the save. */
const SettingChangeSchema = z.object({ from: z.unknown(), to: z.unknown() });
/** Settings saves log only what changed, keyed by the settings field. */
const SettingsChangesSchema = z.record(z.string(), SettingChangeSchema);
export type SettingsChanges = z.infer<typeof SettingsChangesSchema>;

/** `{ "2026-08-12": "can", … }` — an availability diff bucket. */
const DayStatusMapSchema = z.record(z.string(), z.enum(["can", "maybe"]));

export const GREETING_KINDS = [
  "skill-intro",
  "spotlight",
  "purchase-vote-announce",
  "purchase-vote-reminder",
  "arrival",
  "night-invite",
] as const;
export const GreetingKindSchema = z.enum(GREETING_KINDS);
export type GreetingKind = z.infer<typeof GreetingKindSchema>;

/** Trainer decks that log study activity. */
export const TRAINER_DECKS = ["quiztopia", "geography"] as const;
export type TrainerDeck = (typeof TRAINER_DECKS)[number];

const TrainDaySchema = z.object({ localDate: DateKey });
const TrainerSettingsSchema = z.object({
  changes: SettingsChangesSchema,
  // Legacy (before 2026-09-28): the whole settings object, no diff.
  language: z.string().optional(),
  newPerDay: z.number().optional(),
  newSetsPerDay: z.number().optional(),
  gameReviewsAffectSrs: z.boolean().optional(),
});
const TrainerResetSchema = z.object({
  states: z.number().int().nonnegative(),
  reviews: z.number().int().nonnegative(),
  reads: z.number().int().nonnegative().optional(),
});

export const ActivityMetaSchemas = {
  // ── Sessions ──
  login: z.object({}),
  /** First authenticated request after 30 min of silence. */
  visit: z.object({}),
  /**
   * A surface the member looked at, reported by the client. `page` is typed
   * `PageViewPage` on the emitting side but stays a string here: a newer web
   * build may name a page this server has never heard of.
   */
  "page-view": z.object({
    page: z.string().min(1),
    detail: z.string().optional(),
    /** What opened it, e.g. `greeting:spotlight` (see `activityVia`). */
    via: z.string().optional(),
  }),
  /**
   * LEGACY — no longer written (2026-09-28). Was logged by the profile GET, so
   * every data fetch of another member's profile (a spotlight's accent colour,
   * each profile sub-page) read as a visit. Profile visits are now the
   * `profile` page view. Kept so old rows render.
   */
  "profile-view": z.object({ targetUserId: z.string() }),

  // ── Nights & RSVPs ──
  rsvp: z.object({
    date: Night,
    status: z.enum(["yes", "no"]),
    previous: z.string().optional(),
    auto: z.literal(true).optional(),
    private: z.literal(true).optional(),
  }),
  "rsvp-cleared": z.object({ date: Night }),
  "rsvp-kick": z.object({ date: Night, targetUserId: z.string() }),
  "night-guest": z.object({ date: Night, targetUserId: z.string(), on: On }),
  "game-vote": z.object({
    date: Night,
    slug: z.string(),
    reaction: z.string().optional(),
    on: On,
    /** "exit" — the EXIT night's second-stage box vote. */
    stage: z.string().optional(),
  }),
  availability: z.object({
    added: DayStatusMapSchema.optional(),
    changed: DayStatusMapSchema.optional(),
    removed: z.array(DateKey).optional(),
    // Legacy (before diff logging): opaque totals.
    can: z.number().optional(),
    maybe: z.number().optional(),
  }),
  "picks-locked": z.object({ date: Night, on: On }),
  "night-locked": z.object({
    date: Night,
    hostName: z.string().optional(),
    private: z.literal(true).optional(),
    seatCount: z.number().int().nullable().optional(),
  }),
  "night-unlocked": z.object({ date: Night }),
  "night-invited": z.object({ date: Night, userIds: z.array(z.string()) }),
  "night-uninvited": z.object({ date: Night, userIds: z.array(z.string()) }),
  "night-seats": z.object({ date: Night, seatCount: z.number().int().nullable() }),
  "night-pick-mode": z.object({ date: Night, pickMode: z.enum(["host", "group"]) }),
  "calendar-feed-subscribe": z.object({}),
  "calendar-feed-unsubscribe": z.object({}),

  // ── Profile ──
  "profile-update": z.object({}),
  "theme-update": z.object({ preset: z.string() }),
  /** `targetUserId` only when an admin saved someone else's avatar. */
  "avatar-save": z.object({ targetUserId: z.string().optional() }),

  // ── Matches & ratings ──
  "match-recorded": z.object({ gameTitle: z.string(), date: Night.optional() }),
  "match-deleted": z.object({ matchId: z.number().int() }),
  "guest-merged": z.object({
    guestName: z.string(),
    targetUserId: z.string(),
    matchesUpdated: z.number().int(),
  }),
  "skill-recomputed": z.object({
    matches: z.number().int(),
    ranked: z.number().int(),
    candidates: z.number().int(),
  }),

  // ── Greetings (takeover cards) ──
  "greeting-published": z.object({
    greetingId: z.number().int(),
    targetUserId: z.string(),
    eventKind: z.string(),
  }),
  "greeting-retracted": z.object({ greetingId: z.number().int() }),
  /** The member answered a greeting: "later" = dismissed it, "cta" = pressed its button. */
  "greeting-response": z.object({
    kind: GreetingKindSchema,
    action: GreetingAckActionSchema,
    pollId: z.number().int().optional(),
    arrivalId: z.string().optional(),
    date: Night.optional(),
    greetingId: z.number().int().optional(),
    /** A spotlight's subject (since 2026-09-28). */
    subjectUserId: z.string().optional(),
  }),

  // ── Collection ──
  "ownership-announced": z.object({
    slug: z.string().optional(),
    freeTextName: z.string().optional(),
  }),
  "ownership-resolved": z.object({
    action: z.enum(["approve", "approve-custom", "dismiss"]),
    slug: z.string().optional(),
  }),
  "ownership-removed": z.object({ slug: z.string(), by: z.string() }),
  "played-through": z.object({ slug: z.string(), playedThrough: z.boolean() }),

  // ── Purchase votes & arrivals ──
  "purchase-vote": z.object({ pollId: z.number().int(), slugs: z.array(z.string()) }),
  "purchase-vote-sealed": z.object({ pollId: z.number().int() }),
  "purchase-vote-admin": z.object({
    action: z.enum(["create", "close", "delete"]),
    pollId: z.number().int().optional(),
    candidates: z.array(z.string()).optional(),
    requiredVoters: z.number().int().optional(),
  }),
  "arrival-published": z.object({
    arrivalId: z.string(),
    pollId: z.number().int(),
    games: z.array(z.object({ slug: z.string(), purchaserUserId: z.string() })),
  }),
  "arrival-received": z.object({
    arrivalId: z.string(),
    pollId: z.number().int(),
    slug: z.string(),
  }),
  "arrival-retracted": z.object({ arrivalId: z.string(), pollId: z.number().int() }),

  // ── Trainers ──
  /** First trainer review of the member's local date. */
  "quiztopia-train": TrainDaySchema,
  "quiztopia-settings": TrainerSettingsSchema,
  "quiztopia-reset": TrainerResetSchema,
  "geography-train": TrainDaySchema,
  "geography-settings": TrainerSettingsSchema,
  "geography-reset": TrainerResetSchema,
} as const;

type MetaSchemas = typeof ActivityMetaSchemas;
export type ActivityType = keyof MetaSchemas;
export const ACTIVITY_TYPES = Object.keys(ActivityMetaSchemas) as ActivityType[];

/** Types kept only so old rows render; the server can no longer log them. */
export const LEGACY_ACTIVITY_TYPES = ["profile-view"] as const satisfies readonly ActivityType[];
export type WritableActivityType = Exclude<ActivityType, (typeof LEGACY_ACTIVITY_TYPES)[number]>;

/** What a call site passes to `logActivity(type, meta)`. */
export type ActivityMetaInput<T extends ActivityType> = z.input<MetaSchemas[T]>;

/**
 * What a reader gets: every field optional, because rows outlive schema
 * changes and a malformed field is dropped rather than failing the row.
 */
export type ActivityMeta<T extends ActivityType> = Partial<z.output<MetaSchemas[T]>>;

export function isActivityType(type: string): type is ActivityType {
  return Object.hasOwn(ActivityMetaSchemas, type);
}

type PartialMetaSchemas = { [K in ActivityType]: z.ZodType<ActivityMeta<K>> };
// Every schema's `.partial()`, typed per key. `Object.fromEntries` can't carry
// the key-to-schema pairing through its type, hence the one assertion (the
// test parses every type through it).
const PARTIAL_META_SCHEMAS = Object.fromEntries(
  ACTIVITY_TYPES.map((type) => [type, ActivityMetaSchemas[type].partial()]),
) as unknown as PartialMetaSchemas;

/**
 * Narrow one stored row's meta to its type's shape. Fields that fail their
 * schema are dropped one by one (so `{ slug: 3, date: "2026-09-12" }` still
 * yields the date); unknown keys are stripped. Never throws.
 */
export function parseActivityMeta<T extends ActivityType>(
  type: T,
  raw: Record<string, unknown>,
): ActivityMeta<T> {
  const schema = PARTIAL_META_SCHEMAS[type];
  let input: Record<string, unknown> = raw;
  // Each failed attempt removes the offending top-level keys (or, for an issue
  // with no key, everything), and `{}` always parses against a partial object —
  // so this terminates in at most one pass per key.
  for (;;) {
    const parsed = schema.safeParse(input);
    if (parsed.success) return parsed.data;
    const issues = parsed.error.issues;
    const bad = new Set(issues.map((issue) => String(issue.path[0])));
    input = issues.some((issue) => issue.path.length === 0)
      ? {}
      : Object.fromEntries(Object.entries(input).filter(([key]) => !bad.has(key)));
  }
}

// ── Page views ─────────────────────────────────────────────────────────
//
// `page` names what the member looked at; `detail` narrows it. The web's
// route classifier and component beacons emit these; the drawer's page
// registry is a `Record<PageViewPage, …>` over the same list.

export const PAGE_VIEW_PAGES = [
  // Routes
  "home",
  "calendar",
  "history",
  "players",
  "admin", // detail: tab
  "games",
  "appearance",
  "profile", // detail: userId
  "profile-matches", // detail: userId (same for the four below)
  "profile-collection",
  "profile-purchases",
  "profile-nights",
  "profile-skill",
  // Game shell (detail: game slug)
  "play", // the mode picker
  "play-rules",
  "play-solo",
  "play-companion",
  "play-bga",
  "play-join",
  "play-lobby",
  "play-room",
  "play-replays",
  "play-replay",
  "play-tournament",
  // Trainers (detail: TrainerDeck)
  "trainer",
  "trainer-study",
  "trainer-wiki",
  "trainer-timeline",
  "trainer-explore",
  // Surfaces that aren't routes
  "night", // detail: date key — a night's RSVP card
  "purchase-vote",
  "skill-board", // detail: trait id or game slug
  // Greeting cards being shown (detail: what the card is about, when useful)
  "skill-intro",
  "skill-spotlight", // detail: subject userId
  "purchase-vote-announce", // detail: poll id
  "purchase-vote-reminder", // detail: poll id
  "arrival", // detail: arrival id
  "night-invite", // detail: date key
  "purchase-vote-result", // LEGACY — the card was replaced by arrivals
] as const;
export type PageViewPage = (typeof PAGE_VIEW_PAGES)[number];

export function isPageViewPage(page: string): page is PageViewPage {
  return (PAGE_VIEW_PAGES as readonly string[]).includes(page);
}

/**
 * The `via` a page view carries when a greeting's button opened it. The drawer
 * folds such a view into the greeting's "Followed …" line.
 */
export function greetingVia(kind: GreetingKind): string {
  return `greeting:${kind}`;
}

/** The greeting kind named by a `via`, if it names one. */
export function greetingKindOfVia(via: string | undefined): GreetingKind | undefined {
  if (!via?.startsWith("greeting:")) return undefined;
  const parsed = GreetingKindSchema.safeParse(via.slice("greeting:".length));
  return parsed.success ? parsed.data : undefined;
}
