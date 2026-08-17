// Skill-rating recompute service.
//
// The six-trait ratings are a pure function of (match history, catalog
// weights, engine config) — so this service always recomputes the FULL fit
// (milliseconds at club scale) and stores one derived blob in
// `skill_rating_state`, plus the per-user `user_profiles.skill_json` axes the
// profile hex chart renders. Staleness is detected by fingerprinting the
// inputs; every history mutation triggers a recompute fire-and-forget, and a
// lazy check on read + at boot self-heals any missed trigger (deploys,
// config bumps, campaign back-fills).

import { createHash } from "node:crypto";
import { CATALOG } from "@boardgames/core/games/catalog";
import {
  GameBoardSchema,
  MatchOutcomeSchema,
  type PlayerSkillResponse,
  PlayerSkillResponseSchema,
  SKILL_TRAIT_IDS,
  type SkillHighlightWire,
  TraitBoardSchema,
} from "@boardgames/core/protocol";
import { SKILL_CONFIG_V1 } from "@boardgames/core/skill/config";
import { fitSkillRatings, type SkillMatchInput } from "@boardgames/core/skill/fit";
import { highlightsFor } from "@boardgames/core/skill/highlights";
import { gameLeaderboards, traitStandings } from "@boardgames/core/skill/percentiles";
import { z } from "zod";
import { getDb } from "../db.ts";
import { jsonColumn, parseRow, parseRows } from "./db-rows.ts";
import { groupMatchUnits } from "./match-units.ts";

const config = SKILL_CONFIG_V1;

// ── Stored state ───────────────────────────────────────────────────────

export const StoredSkillStateSchema = z.object({
  eligibleCount: z.number().int().min(0),
  /** Full per-player wire payloads, keyed by userId. */
  players: z.record(z.string(), PlayerSkillResponseSchema),
  leaderboards: z.object({
    traits: z.array(TraitBoardSchema),
    games: z.array(GameBoardSchema),
  }),
});
export type StoredSkillState = z.infer<typeof StoredSkillStateSchema>;

const StateRowSchema = z.object({
  payload_json: jsonColumn(StoredSkillStateSchema),
  input_fingerprint: z.string(),
});

const MatchRowSchema = z.object({
  id: z.number(),
  played_at: z.string(),
  game_slug: z.string().nullable(),
  outcome_json: jsonColumn(MatchOutcomeSchema),
  updated_at: z.string().nullable(),
  recorded_at: z.string(),
});
type MatchRow = z.infer<typeof MatchRowSchema>;

const UserRowSchema = z.object({
  id: z.string(),
  guest: z.number(),
  internal: z.number(),
});

// ── Fingerprint ────────────────────────────────────────────────────────

/**
 * Hash over every match row's (id, last-write time), the catalog's skill
 * vectors, and the engine config version. Any change to any input flips it.
 */
function fingerprintOf(rows: readonly MatchRow[]): string {
  const h = createHash("sha256");
  h.update(`config:${config.version}`);
  for (const entry of CATALOG) h.update(`|${entry.slug}:${JSON.stringify(entry.skills)}`);
  for (const r of rows) h.update(`|${r.id}:${r.updated_at ?? r.recorded_at}`);
  return h.digest("hex");
}

// ── Engine input mapping ───────────────────────────────────────────────

/**
 * DB rows → engine inputs. Campaign sessions collapse into ONE unit (aligned
 * with profile stats); a unit concluded by a back-filled `campaignResult`
 * has that conclusion promoted onto its outcome so the engine sees it.
 */
function toEngineInputs(rows: readonly MatchRow[]): SkillMatchInput[] {
  const units = groupMatchUnits(rows);
  return units.map(({ rep }) => {
    let outcome = rep.outcome_json;
    if (
      outcome.kind === "coop" &&
      outcome.outcome === undefined &&
      outcome.score === undefined &&
      outcome.campaignResult !== undefined
    ) {
      outcome = { ...outcome, outcome: outcome.campaignResult };
    }
    return { slug: rep.game_slug, playedAt: rep.played_at, outcome };
  });
}

// ── Recompute ──────────────────────────────────────────────────────────

async function loadMatchRows(): Promise<MatchRow[]> {
  const { rows } = await getDb().execute(
    `SELECT id, played_at, game_slug, outcome_json, updated_at, recorded_at
     FROM match_results ORDER BY id`,
  );
  return parseRows(MatchRowSchema, rows, "match_results.skill");
}

async function recompute(rows: readonly MatchRow[], fingerprint: string): Promise<void> {
  const db = getDb();
  const userRows = parseRows(
    UserRowSchema,
    (await db.execute("SELECT id, guest, internal FROM user")).rows,
    "user.skill-flags",
  );
  // Guests and internal QA aliases stay in the fit (their games carry real
  // comparative signal) but are never surfaced.
  const visible = new Set(
    userRows.filter((u) => u.guest === 0 && u.internal === 0).map((u) => u.id),
  );

  const fit = fitSkillRatings(toEngineInputs(rows), config);
  if (fit.skippedOffCatalog > 0) {
    console.warn(`[skill] ${fit.skippedOffCatalog} match(es) skipped: no catalog skill vector`);
  }
  const standings = traitStandings(fit, visible, config);
  const boards = gameLeaderboards(fit, visible, config);

  const players: Record<string, PlayerSkillResponse> = {};
  for (const [id, p] of Object.entries(fit.players)) {
    if (!visible.has(id)) continue;
    const traitRows = SKILL_TRAIT_IDS.map((trait) => {
      const row = standings[trait].find((s) => s.userId === id);
      return row
        ? {
            trait,
            percentile: row.percentile,
            score: row.score,
            winChance: row.winChance,
            rank: row.rank,
            of: standings[trait].length,
            provisional: row.provisional,
          }
        : null;
    });
    const eligible = p.eligible && traitRows.every((r) => r !== null);
    const games = Object.entries(boards)
      .map(([slug, board]) => {
        const row = board.find((s) => s.userId === id);
        return row ? { slug, rank: row.rank, of: board.length, matches: row.matches } : null;
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    players[id] = PlayerSkillResponseSchema.parse({
      userId: id,
      eligibility: {
        eligible,
        ratedMatches: p.ratedMatches,
        distinctGames: p.distinctGames,
        minMatches: config.minMatches,
        minGames: config.minGames,
      },
      traits: eligible ? traitRows : null,
      games: eligible ? games : [],
      ratedSlugs: Object.keys(p.games).sort(),
      highlights: eligible ? highlightsFor(id, standings, boards, config) : [],
    });
  }

  const state = StoredSkillStateSchema.parse({
    eligibleCount: standings.int.length,
    players,
    leaderboards: {
      traits: SKILL_TRAIT_IDS.flatMap((trait) => {
        const board = standings[trait].filter((s) => !s.provisional);
        if (board.length < config.minLeaderboardPlayers) return [];
        return [
          {
            trait,
            entries: board.map((s, i) => ({
              userId: s.userId,
              rank: i + 1,
              percentile: s.percentile,
              score: s.score,
            })),
          },
        ];
      }),
      games: Object.entries(boards).map(([slug, board]) => ({
        slug,
        entries: board.map((s) => ({ userId: s.userId, rank: s.rank, matches: s.matches })),
      })),
    },
  });

  // skill_json: the hex chart's six axes — score/100, provisional flags.
  const skillJsonWrites = Object.values(players)
    .filter((p) => p.eligibility.eligible && p.traits !== null)
    .map((p) => ({
      sql: `INSERT INTO user_profiles (user_id, skill_json, updated_at)
            VALUES (?, ?, datetime('now'))
            ON CONFLICT(user_id) DO UPDATE SET skill_json = excluded.skill_json`,
      args: [
        p.userId,
        JSON.stringify({
          axes: (p.traits ?? []).map((t) => ({
            label: traitLabel(t.trait),
            // Provisional axes read 0 — "not computed yet", not mid-pack.
            value: t.provisional ? 0 : t.score / 100,
            ...(t.provisional ? { provisional: true } : { winChance: t.winChance }),
          })),
        }),
      ],
    }));
  const eligibleIds = Object.values(players)
    .filter((p) => p.eligibility.eligible)
    .map((p) => p.userId);
  const notEligiblePlaceholders = eligibleIds.map(() => "?").join(",");

  await db.batch(
    [
      {
        sql: `INSERT INTO skill_rating_state (id, payload_json, input_fingerprint, config_version, computed_at)
              VALUES (1, ?, ?, ?, datetime('now'))
              ON CONFLICT(id) DO UPDATE SET
                payload_json = excluded.payload_json,
                input_fingerprint = excluded.input_fingerprint,
                config_version = excluded.config_version,
                computed_at = excluded.computed_at`,
        args: [JSON.stringify(state), fingerprint, config.version],
      },
      // Players who lost eligibility (match deleted, guest merged away) must
      // drop back to the ghosted chart rather than keep a stale hexagon.
      ...(eligibleIds.length > 0
        ? [
            {
              sql: `UPDATE user_profiles SET skill_json = NULL
                    WHERE skill_json IS NOT NULL AND user_id NOT IN (${notEligiblePlaceholders})`,
              args: eligibleIds,
            },
          ]
        : [
            {
              sql: "UPDATE user_profiles SET skill_json = NULL WHERE skill_json IS NOT NULL",
              args: [],
            },
          ]),
      ...skillJsonWrites,
    ],
    "write",
  );
}

const TRAIT_LABELS: Record<string, string> = {
  int: "Intelligence",
  pln: "Planning",
  per: "Perception",
  soph: "Sophistication",
  soc: "Social",
  dex: "Dexterity",
};
function traitLabel(trait: string): string {
  return TRAIT_LABELS[trait] ?? trait;
}

// ── Public API ─────────────────────────────────────────────────────────

let inFlight: Promise<StoredSkillState | null> | null = null;

/**
 * Return the current skill state, recomputing first if the stored
 * fingerprint no longer matches the inputs. Concurrent callers share one
 * recompute. Returns null only when the state cannot be produced at all.
 */
export async function ensureSkillState(): Promise<StoredSkillState | null> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const rows = await loadMatchRows();
      const fingerprint = fingerprintOf(rows);
      const stored = await getDb().execute(
        "SELECT payload_json, input_fingerprint FROM skill_rating_state WHERE id = 1",
      );
      if (stored.rows.length > 0) {
        // A payload written by an older schema fails to parse — that is a
        // stale state, not an error: fall through to the recompute.
        try {
          const parsed = parseRow(StateRowSchema, stored.rows[0], "skill_rating_state");
          if (parsed.input_fingerprint === fingerprint) return parsed.payload_json;
        } catch {
          console.warn("[skill] stored state failed schema parse — recomputing");
        }
      }
      await recompute(rows, fingerprint);
      const refetched = await getDb().execute(
        "SELECT payload_json, input_fingerprint FROM skill_rating_state WHERE id = 1",
      );
      return refetched.rows.length > 0
        ? parseRow(StateRowSchema, refetched.rows[0], "skill_rating_state").payload_json
        : null;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/**
 * Fire-and-forget recompute for history mutation paths — mirrors
 * `resolveCampaignSessions`: a failed recompute must never fail the request,
 * and the lazy staleness check self-heals later.
 */
export function triggerSkillRecompute(): void {
  ensureSkillState().catch((err) => {
    console.error("[skill] recompute failed:", err);
  });
}

/** The viewer's headline fact, for the one-time intro card. */
export function introHighlightFor(
  state: StoredSkillState,
  userId: string,
): SkillHighlightWire | null {
  return state.players[userId]?.highlights[0] ?? null;
}
