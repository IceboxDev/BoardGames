// Skill-trait vocabulary and per-game skill weights.
//
// Every catalog game carries a fixed six-trait weight vector (`skills` in
// `games/catalog.json`) describing how much a result in that game says about
// each trait. Weights are editorial constants — integers summing to exactly
// 100 — and are the input the rating engine (`core/src/skill/`) uses to turn
// match outcomes into per-trait evidence. Clients render them but must never
// re-derive or normalize them.

import { z } from "zod";

/**
 * The canonical trait order. Everything trait-indexed (weights, ratings,
 * chart axes, leaderboards) follows this order.
 */
export const SKILL_TRAITS = [
  { id: "int", label: "Intelligence" },
  { id: "pln", label: "Planning" },
  { id: "per", label: "Perception" },
  { id: "soph", label: "Sophistication" },
  { id: "soc", label: "Social" },
  { id: "dex", label: "Dexterity" },
] as const;

export type SkillTraitId = (typeof SKILL_TRAITS)[number]["id"];

export const SKILL_TRAIT_IDS = SKILL_TRAITS.map((t) => t.id) as readonly SkillTraitId[];

const WeightSchema = z.number().int().min(0).max(100);

/**
 * Per-game trait weights. Integers 0..100 summing to exactly 100 — the sum
 * invariant means a game's total evidence is constant and only its
 * *distribution* across traits varies.
 */
export const SkillWeightsSchema = z
  .object({
    int: WeightSchema,
    pln: WeightSchema,
    per: WeightSchema,
    soph: WeightSchema,
    soc: WeightSchema,
    dex: WeightSchema,
  })
  .refine(
    (w) => w.int + w.pln + w.per + w.soph + w.soc + w.dex === 100,
    "skill weights must sum to exactly 100",
  );

export type SkillWeights = z.infer<typeof SkillWeightsSchema>;

// ── Shared endpoint primitives ─────────────────────────────────────────
// Unbranded slug string, same idiom as history.ts/profile-insights.ts —
// branded schemas stay out of response shapes.
const GameSlugStringSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);

export const SkillTraitIdSchema = z.enum(["int", "pln", "per", "soph", "soc", "dex"]);

/**
 * One checkable "best true fact" about a player, produced by the engine's
 * highlight ladder (strongest claim first). Clients render copy from `kind`;
 * they must never invent facts of their own.
 */
export const SkillHighlightSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("trait-first"), trait: SkillTraitIdSchema }),
  z.object({
    kind: z.literal("trait-top3"),
    trait: SkillTraitIdSchema,
    rank: z.number().int().min(2).max(3),
  }),
  z.object({
    kind: z.literal("game-first"),
    slug: GameSlugStringSchema,
    matches: z.number().int().min(2),
  }),
  z.object({
    kind: z.literal("trait-strong"),
    trait: SkillTraitIdSchema,
    percentile: z.number().min(0).max(100),
    /** Displayed 0–100 score (group-relative scale; best trait = 100). */
    score: z.number().int().min(0).max(100),
  }),
  z.object({
    kind: z.literal("top-trait"),
    trait: SkillTraitIdSchema,
    percentile: z.number().min(0).max(100),
    score: z.number().int().min(0).max(100),
  }),
]);
export type SkillHighlightWire = z.infer<typeof SkillHighlightSchema>;

// ── GET /api/skills/players/:userId ────────────────────────────────────
// Everything below is server-derived from the fitted rating state; clients
// must never re-derive ranks or percentiles.

export const SkillEligibilitySchema = z.object({
  eligible: z.boolean(),
  ratedMatches: z.number().int().min(0),
  distinctGames: z.number().int().min(0),
  /** Thresholds echoed so progress UI never hard-codes them. */
  minMatches: z.number().int().min(1),
  minGames: z.number().int().min(1),
});
export type SkillEligibility = z.infer<typeof SkillEligibilitySchema>;

export const PlayerTraitStandingSchema = z.object({
  trait: SkillTraitIdSchema,
  /** Hazen percentile 0–100 among eligible players (ordering/analytics). */
  percentile: z.number().min(0).max(100),
  /**
   * The DISPLAYED 0–100 score: group-relative scale where the group's best
   * trait rating is exactly 100 and a hardcoded floor θ is 0. Provisional
   * axes report 0 ("not computed yet"). The number every score surface
   * renders.
   */
  score: z.number().int().min(0).max(100),
  /** Literal win probability (%) vs an average-rated member (tooltips). */
  winChance: z.number().int().min(1).max(99),
  rank: z.number().int().min(1),
  /** Field size behind the rank (kept for analytics; not shown in UI copy). */
  of: z.number().int().min(1),
  /** Too little evidence on this axis to rank confidently. */
  provisional: z.boolean(),
});
export type PlayerTraitStanding = z.infer<typeof PlayerTraitStandingSchema>;

export const PlayerGameStandingSchema = z.object({
  slug: GameSlugStringSchema,
  rank: z.number().int().min(1),
  of: z.number().int().min(1),
  /** Rated matches of this game the player appeared in. */
  matches: z.number().int().min(1),
});
export type PlayerGameStanding = z.infer<typeof PlayerGameStandingSchema>;

export const PlayerSkillResponseSchema = z.object({
  userId: z.string().min(1),
  eligibility: SkillEligibilitySchema,
  /** Null until eligible — six entries in canonical trait order afterwards. */
  traits: z.array(PlayerTraitStandingSchema).length(6).nullable(),
  /** The player's rows on per-game leaderboards they appear on. */
  games: z.array(PlayerGameStandingSchema),
  /**
   * Every game that actually fed this player's rating (sorted slugs) — the
   * honest source for "sharpened by …" copy. A played game missing here
   * carried no competitive evidence (moderated seat, lone scored co-op…).
   */
  ratedSlugs: z.array(GameSlugStringSchema),
  /** Highlight ladder, strongest claim first; empty until eligible. */
  highlights: z.array(SkillHighlightSchema),
});
export type PlayerSkillResponse = z.infer<typeof PlayerSkillResponseSchema>;

// ── GET /api/skills/leaderboards ───────────────────────────────────────

export const TraitBoardEntrySchema = z.object({
  userId: z.string().min(1),
  rank: z.number().int().min(1),
  percentile: z.number().min(0).max(100),
  /** Displayed 0–100 score (see PlayerTraitStanding.score). */
  score: z.number().int().min(0).max(100),
});
export const TraitBoardSchema = z.object({
  trait: SkillTraitIdSchema,
  entries: z.array(TraitBoardEntrySchema).min(1),
});
export type TraitBoard = z.infer<typeof TraitBoardSchema>;

export const GameBoardEntrySchema = z.object({
  userId: z.string().min(1),
  rank: z.number().int().min(1),
  matches: z.number().int().min(1),
});
export const GameBoardSchema = z.object({
  slug: GameSlugStringSchema,
  entries: z.array(GameBoardEntrySchema).min(1),
});
export type GameBoard = z.infer<typeof GameBoardSchema>;

export const SkillPlayerRefSchema = z.object({
  name: z.string().min(1),
  image: z.string().nullable(),
});
export type SkillPlayerRef = z.infer<typeof SkillPlayerRefSchema>;

export const SkillLeaderboardsResponseSchema = z.object({
  eligibleCount: z.number().int().min(0),
  /**
   * When the fit these boards come from was last run — SQLite
   * `datetime('now')`, UTC, "YYYY-MM-DD HH:MM:SS". Ratings only move when an
   * admin recomputes, so surfaces MUST show this: without it, "I won last
   * night and nothing changed" reads as a bug rather than a schedule.
   */
  computedAt: z.string().min(1).nullable(),
  /** Only traits whose board cleared the exposure/count gates. */
  traits: z.array(TraitBoardSchema),
  games: z.array(GameBoardSchema),
  /** Side-car name/image map for every referenced userId. */
  players: z.record(z.string(), SkillPlayerRefSchema),
});
export type SkillLeaderboardsResponse = z.infer<typeof SkillLeaderboardsResponseSchema>;

// ── Spotlights ─────────────────────────────────────────────────────────
//
// A spotlight is group news about one member's best move since the previous
// rating run. Everything here is a RANK fact, checkable against the boards the
// hall of fame renders — never a raw rating, and never framed as someone else
// losing ground.

export const SpotlightEventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("trait-climb"),
    trait: SkillTraitIdSchema,
    /** Null when they weren't on this board before. */
    from: z.number().int().min(1).nullable(),
    to: z.number().int().min(1),
    fieldSize: z.number().int().min(1),
  }),
  z.object({
    kind: z.literal("game-climb"),
    slug: GameSlugStringSchema,
    from: z.number().int().min(1).nullable(),
    to: z.number().int().min(1),
    fieldSize: z.number().int().min(1),
  }),
  z.object({
    kind: z.literal("profile-unlocked"),
    ratedMatches: z.number().int().min(0),
    distinctGames: z.number().int().min(0),
  }),
  z.object({ kind: z.literal("streak-lead"), length: z.number().int().min(2) }),
]);
export type SpotlightEvent = z.infer<typeof SpotlightEventSchema>;

export const SpotlightRunnerUpSchema = z.object({
  userId: z.string().min(1),
  event: SpotlightEventSchema,
});

/**
 * The board as it stood when the spotlight was published — the top few rows
 * plus the subject's own. Snapshotted rather than looked up live, so a card
 * published on Tuesday still shows the standing it was celebrating after
 * Thursday's recompute moves everyone again. The heading is NOT stored: the
 * client already resolves trait labels and game titles from the event.
 */
export const SpotlightProofSchema = z.object({
  rows: z
    .array(
      z.object({
        userId: z.string().min(1),
        rank: z.number().int().min(1),
        /** Pre-formatted right-hand value (a score, or "6×" plays). */
        value: z.string(),
      }),
    )
    .min(1),
});

export const SpotlightPayloadSchema = z.object({
  event: SpotlightEventSchema,
  runnersUp: z.array(SpotlightRunnerUpSchema).max(2),
  proof: SpotlightProofSchema.nullable(),
});
export type SpotlightPayload = z.infer<typeof SpotlightPayloadSchema>;

// ── GET /api/skills/greeting + POST /api/skills/greeting/ack ───────────
//
// One queue for every celebratory takeover the app can show, so exactly one
// can be pending at a time and the client never has to arbitrate. The intro
// outranks a spotlight: being told what a Planning leader IS has to come
// before being told who the new one is.

export const GreetingSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("skill-intro"),
    /** The viewer's own headline fact. */
    highlight: SkillHighlightSchema,
  }),
  z.object({
    kind: z.literal("spotlight"),
    id: z.number().int().positive(),
    subjectUserId: z.string().min(1),
    payload: SpotlightPayloadSchema,
  }),
]);
export type Greeting = z.infer<typeof GreetingSchema>;

export const GreetingResponseSchema = z.object({
  /** Null when the viewer has nothing pending. */
  greeting: GreetingSchema.nullable(),
  /** Side-car name/image map for every userId the greeting references. */
  players: z.record(z.string(), SkillPlayerRefSchema),
});
export type GreetingResponse = z.infer<typeof GreetingResponseSchema>;

export const GreetingAckBodySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("skill-intro") }),
  z.object({ kind: z.literal("spotlight"), id: z.number().int().positive() }),
]);
export type GreetingAckBody = z.infer<typeof GreetingAckBodySchema>;

export const GreetingAckResponseSchema = z.object({ ok: z.literal(true) });

// ── Admin: /api/admin/skills ───────────────────────────────────────────

export const SpotlightCandidateSchema = z.object({
  /** Stable id — what the admin publishes by. */
  key: z.string().min(1),
  subjectUserId: z.string().min(1),
  event: SpotlightEventSchema,
  score: z.number(),
});
export type SpotlightCandidate = z.infer<typeof SpotlightCandidateSchema>;

export const PublishedGreetingSchema = z.object({
  id: z.number().int().positive(),
  createdAt: z.string().min(1),
  subjectUserId: z.string().min(1),
  payload: SpotlightPayloadSchema,
  /** How many members have dismissed it. */
  seenBy: z.number().int().min(0),
});

export const AdminSkillStateResponseSchema = z.object({
  /** SQLite `datetime('now')`; null before the first run. */
  computedAt: z.string().min(1).nullable(),
  baselineComputedAt: z.string().min(1).nullable(),
  configVersion: z.number().int().nullable(),
  /** True when the match history changed (recorded/edited/deleted) since the last run. */
  stale: z.boolean(),
  matchesTotal: z.number().int().min(0),
  /** New matches recorded after the last run. */
  matchesRecordedSince: z.number().int().min(0),
  /** Pre-existing matches edited after the last run (a moderator backfill, a score fix). */
  matchesEditedSince: z.number().int().min(0),
  eligibleCount: z.number().int().min(0),
  /** Ranked best-first; empty when nothing moved or there is no baseline. */
  candidates: z.array(SpotlightCandidateSchema),
  /** The spotlight currently showing to the group, if any. */
  live: PublishedGreetingSchema.nullable(),
  players: z.record(z.string(), SkillPlayerRefSchema),
});
export type AdminSkillStateResponse = z.infer<typeof AdminSkillStateResponseSchema>;

export const PublishGreetingBodySchema = z.object({ candidateKey: z.string().min(1) });
export type PublishGreetingBody = z.infer<typeof PublishGreetingBodySchema>;
