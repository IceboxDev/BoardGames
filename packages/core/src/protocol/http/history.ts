import { z } from "zod";

// ── Primitives ─────────────────────────────────────────────────────────
// `playedAt` is the user-supplied wall-clock time the match happened.
// Looser than `IsoTimestampSchema` in `../common.ts` (which mandates
// seconds + timezone) because the form may submit `2026-05-10T19:30Z` or
// `2026-05-10T19:30:00.000+02:00`. Keep symmetric for read + write.
const PlayedAtSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?$/,
    "Expected ISO-8601 datetime",
  );

// `dateKey` and `gameSlug` validated inline (not via the branded
// `DateKeySchema` / `GameSlugSchema` from common.ts) so that the inferred
// types stay plain `string` and remain interchangeable with the existing
// declarations in `@boardgames/core/history/types`.
const DateKeyStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const GameSlugStringSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,63}$/, "Expected kebab-case slug, max 64 chars");

// ── Participants ──────────────────────────────────────────────────────
export const ParticipantSchema = z.object({
  userId: z.string().min(1).max(100),
  displayName: z.string().min(1).max(200),
});
export type Participant = z.infer<typeof ParticipantSchema>;

// ── Outcome variants ──────────────────────────────────────────────────
// Keep each variant as a plain `z.object` so `z.discriminatedUnion` can
// see the literal `kind` discriminator. Cross-field rules (winner index
// in range, last-standing has a survivor) live on the union below.

const FreeForAllPlayerSchema = ParticipantSchema.extend({
  score: z.number().finite(),
  rank: z.number().int().optional(),
  // Optional per-player role/character label. Motivating case: Villainous,
  // a point-less free-for-all where each player plays a named villain
  // (Maleficent, Jafar, …); the sole winner is marked with `rank: 1` and every
  // score stays 0. Same shape and intent as `TeamMember.role`.
  role: z.string().max(64).optional(),
});

const MatchOutcomeFreeForAllSchema = z.object({
  kind: z.literal("free-for-all"),
  players: z.array(FreeForAllPlayerSchema).min(2).max(20),
  // Optional per-game variant tag (e.g. 7 Wonders expansions). Same shape and
  // intent as the `scenario` field on teams matches.
  scenario: z.string().max(64).optional(),
});
export type MatchOutcomeFreeForAll = z.infer<typeof MatchOutcomeFreeForAllSchema>;

const TeamMemberSchema = ParticipantSchema.extend({
  role: z.string().max(64).optional(),
  // Marker for team games where individual members can be killed/voted out
  // mid-game (One Night Werewolf, Werewolf-style games). Optional and purely
  // descriptive — the team's win/loss is still expressed via
  // `winnerTeamIndices`.
  eliminated: z.boolean().optional(),
});

const TeamSchema = z.object({
  members: z.array(TeamMemberSchema).min(1),
  score: z.number().finite().optional(),
  rank: z.number().int().optional(),
});

// Optional non-competing slot — Blood on the Clocktower's Storyteller is the
// motivating case (host runs the game, never wins/loses, may take a Fabled
// "character"). Generic enough to fit other moderator-led games later.
const ModeratorSchema = ParticipantSchema.extend({
  role: z.string().max(64).optional(),
});

const MatchOutcomeTeamsSchema = z.object({
  kind: z.literal("teams"),
  teams: z.array(TeamSchema).min(2).max(8),
  winnerTeamIndices: z.array(z.number().int().min(0)).min(1),
  moderator: ModeratorSchema.optional(),
  // Optional display tag — Clocktower edition label ("Trouble Brewing"),
  // Werewolf scenario label ("Moonstruck"), etc. Free-text so games can use
  // it however they need; capped at 64 chars for the same reason `role` is.
  scenario: z.string().max(64).optional(),
});
export type MatchOutcomeTeams = z.infer<typeof MatchOutcomeTeamsSchema>;

const LastStandingPlayerSchema = ParticipantSchema.extend({
  eliminationOrder: z.number().int().optional(),
  // Optional per-player role/character label. Motivating case: Dungeon Mayhem,
  // an elimination game where each player plays a named hero (Sutha, Azzan, …);
  // last hero un-eliminated wins. Same shape and intent as `FreeForAllPlayer.role`
  // / `TeamMember.role`.
  role: z.string().max(64).optional(),
});

const MatchOutcomeLastStandingSchema = z.object({
  kind: z.literal("last-standing"),
  players: z.array(LastStandingPlayerSchema).min(2).max(20),
  // Optional per-game variant tag (e.g. Exploding Kittens death/revival modes).
  scenario: z.string().max(64).optional(),
});
export type MatchOutcomeLastStanding = z.infer<typeof MatchOutcomeLastStandingSchema>;

// A co-op participant. `condition` is D&D-specific: whether this character went
// down during the session — "unconscious" (dropped to 0 HP but survived) or
// "dead" (permanent character death). Absent = came through unscathed. It is the
// only per-player datum a co-op carries; the win/loss is shared by the table.
export const CoopParticipantSchema = ParticipantSchema.extend({
  condition: z.enum(["unconscious", "dead"]).optional(),
});
export type CoopParticipant = z.infer<typeof CoopParticipantSchema>;

const MatchOutcomeCoopSchema = z.object({
  kind: z.literal("coop"),
  participants: z.array(CoopParticipantSchema).min(1).max(20),
  // win/loss for binary co-ops (Pandemic, etc.). Optional because some co-ops are
  // SCORED, not won/lost — Just One banks 0–13 points that map to a flavour tier
  // with no winner — and because a D&D `campaign` session may be UNRESOLVED (see
  // below). A coop match must carry at least one of `outcome` / `score` /
  // `campaign` (enforced on the union below).
  outcome: z.enum(["win", "loss"]).optional(),
  // Shared team score for scored co-ops (Just One). Independent of `outcome` — a
  // game uses one or the other.
  score: z.number().int().min(0).max(1000).optional(),
  difficulty: z.string().max(64).optional(),
  details: z.string().max(1000).optional(),
  // Optional per-game variant tag (e.g. Codenames Duet language).
  scenario: z.string().max(64).optional(),
  // D&D campaign / one-shot name. A "campaign session" is the one co-op shape
  // allowed to carry no `outcome` and no `score`: an UNRESOLVED session the
  // party continues next time (a two-shot's first sitting). When the story
  // concludes, the final session is recorded with `outcome` win/loss. The
  // refinement below accepts `campaign` in lieu of an outcome/score.
  campaign: z.string().min(1).max(120).optional(),
});
export type MatchOutcomeCoop = z.infer<typeof MatchOutcomeCoopSchema>;

const OneVsManySoloSchema = ParticipantSchema.extend({
  roleLabel: z.string().max(64).optional(),
});

const MatchOutcomeOneVsManySchema = z.object({
  kind: z.literal("one-vs-many"),
  solo: OneVsManySoloSchema,
  team: z.object({
    roleLabel: z.string().max(64).optional(),
    members: z.array(ParticipantSchema).min(1),
  }),
  winnerSide: z.enum(["solo", "team"]),
});
export type MatchOutcomeOneVsMany = z.infer<typeof MatchOutcomeOneVsManySchema>;

export const MatchOutcomeSchema = z
  .discriminatedUnion("kind", [
    MatchOutcomeFreeForAllSchema,
    MatchOutcomeTeamsSchema,
    MatchOutcomeLastStandingSchema,
    MatchOutcomeCoopSchema,
    MatchOutcomeOneVsManySchema,
  ])
  .superRefine((v, ctx) => {
    if (v.kind === "teams") {
      for (const idx of v.winnerTeamIndices) {
        if (idx >= v.teams.length) {
          ctx.addIssue({
            code: "custom",
            path: ["winnerTeamIndices"],
            message: `winner index ${idx} out of range`,
          });
          return;
        }
      }
    } else if (v.kind === "last-standing") {
      if (v.players.every((p) => p.eliminationOrder !== undefined)) {
        ctx.addIssue({
          code: "custom",
          path: ["players"],
          message: "at least one player must survive",
        });
      }
    } else if (v.kind === "coop") {
      // A D&D `campaign` session may be unresolved (no outcome yet — it
      // continues next time). Every other co-op needs a win/loss or a score.
      if (v.outcome === undefined && v.score === undefined && v.campaign === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["outcome"],
          message: "coop match needs a win/loss outcome or a score",
        });
      }
    }
  });
export type MatchOutcome = z.infer<typeof MatchOutcomeSchema>;
export type MatchKind = MatchOutcome["kind"];

export const MATCH_KINDS = [
  "free-for-all",
  "teams",
  "last-standing",
  "coop",
  "one-vs-many",
] as const satisfies readonly MatchKind[];

// ── Records & request/response shapes ─────────────────────────────────

export const MatchRecordSchema = z.object({
  id: z.number().int(),
  dateKey: DateKeyStringSchema.nullable(),
  playedAt: PlayedAtSchema,
  gameSlug: GameSlugStringSchema.nullable(),
  gameTitle: z.string().min(1).max(200),
  outcome: MatchOutcomeSchema,
  notes: z.string().nullable(),
  recordedBy: z.string(),
  // `recordedAt` and `updatedAt` are SQLite `datetime('now')` strings
  // ("YYYY-MM-DD HH:MM:SS") — opaque server tokens, not ISO. Keep as plain
  // strings so cached payloads stay parseable.
  recordedAt: z.string(),
  updatedAt: z.string().nullable(),
  // Server-managed ordering within a night (lower = nearer the top). Admins
  // reorder via the `/reorder` endpoint; the client sorts each night by it.
  // May be negative (a newly-recorded match is slotted above the rest).
  sortOrder: z.number().int(),
});
export type MatchRecord = z.infer<typeof MatchRecordSchema>;

export const MatchCreateInputSchema = z.object({
  dateKey: DateKeyStringSchema.nullable(),
  playedAt: PlayedAtSchema,
  gameSlug: GameSlugStringSchema.nullable(),
  gameTitle: z.string().min(1).max(200),
  outcome: MatchOutcomeSchema,
  notes: z.string().nullable(),
  // Optional client-generated idempotency key. A retried/double-clicked submit
  // reuses it so the server records the match once (partial unique index on
  // match_results.client_id). Only meaningful on create; ignored by the PATCH
  // update path, which shares this schema.
  clientId: z.string().min(1).max(100).optional(),
});
export type MatchCreateInput = z.infer<typeof MatchCreateInputSchema>;

// The server's PATCH endpoint re-runs the full create-input parser today,
// so the wire body for an update is identical to a create. Kept as an
// alias so callers can keep using the `MatchUpdateInput` name.
export type MatchUpdateInput = MatchCreateInput;

export const HistoryListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  before: z.string().optional(),
});
export type HistoryListQuery = z.infer<typeof HistoryListQuerySchema>;

export const HistoryListResponseSchema = z.object({
  matches: z.array(MatchRecordSchema),
  nextBefore: z.string().nullable(),
});
export type HistoryListResponse = z.infer<typeof HistoryListResponseSchema>;

export const MatchByNightResponseSchema = z.object({
  matches: z.array(MatchRecordSchema),
});
export type MatchByNightResponse = z.infer<typeof MatchByNightResponseSchema>;

// ── D&D open campaigns ────────────────────────────────────────────────
// Campaign / one-shot names that have at least one recorded session but no
// resolved one yet. Feeds the record-match form's campaign dropdown so an
// ongoing campaign doesn't have to be retyped each session; a name drops off
// the list once any of its sessions is recorded with a win/loss.
export const DndOpenCampaignsResponseSchema = z.object({
  campaigns: z.array(z.string().min(1).max(120)),
});
export type DndOpenCampaignsResponse = z.infer<typeof DndOpenCampaignsResponseSchema>;

export const DeleteMatchResponseSchema = z.object({ ok: z.literal(true) });
export type DeleteMatchResponse = z.infer<typeof DeleteMatchResponseSchema>;

// ── Reorder (admin) ───────────────────────────────────────────────────
// Re-sort the matches inside one board game night. `orderedIds` is the full
// set of match ids for `dateKey`, top-to-bottom; the server rejects an
// incomplete or foreign set and assigns `sort_order = index`.
export const MatchReorderInputSchema = z.object({
  // The lock night's dateKey, or null to reorder a standalone day-bucket — those
  // matches have no dateKey, so the server scopes them by `date_key IS NULL`.
  dateKey: DateKeyStringSchema.nullable(),
  orderedIds: z.array(z.number().int().positive()).min(1),
});
export type MatchReorderInput = z.infer<typeof MatchReorderInputSchema>;

export const MatchReorderResponseSchema = z.object({ ok: z.literal(true) });
export type MatchReorderResponse = z.infer<typeof MatchReorderResponseSchema>;
