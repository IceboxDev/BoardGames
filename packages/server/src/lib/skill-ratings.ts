// Skill-rating recompute service.
//
// The six-trait ratings are a pure function of (match history, catalog
// weights, engine config) — so this service always recomputes the FULL fit
// (milliseconds at group scale) and stores one derived blob in
// `skill_rating_state`, plus the per-user `user_profiles.skill_json` axes the
// profile hex chart renders.
//
// WHEN it recomputes is the deliberate part. Two fingerprints, two policies:
//
// - ENGINE drift (config version or a catalog skill vector changed) means the
//   stored numbers were produced by maths this build no longer runs, so it
//   self-heals lazily on read and at boot.
// - DATA drift (a match was added, edited, deleted, or a guest merged) is left
//   alone. Recording ten games of a board-game night used to run ten full
//   fits; now an admin presses Recompute once when the night is done, which is
//   also what gives the spotlight diff a stable before/after to compare.
//
// The state row therefore carries its own predecessor (`prev_*`): the payload
// the current one replaced, plus the config version it was fitted under so a
// diff across an engine change can be refused rather than blamed on a player.

import { createHash } from "node:crypto";
import { CATALOG } from "@boardgames/core/games/catalog";
import { extractParticipantIds } from "@boardgames/core/history/participant-results";
import { lowScoreWinsForSlug } from "@boardgames/core/history/score-config";
import { activeWinStreak, type StreakResult } from "@boardgames/core/history/streaks";
import {
  GameBoardSchema,
  MatchOutcomeSchema,
  type PlayerSkillResponse,
  PlayerSkillResponseSchema,
  SKILL_TRAIT_IDS,
  TraitBoardSchema,
} from "@boardgames/core/protocol";
import { SKILL_CONFIG_V1 } from "@boardgames/core/skill/config";
import { fitSkillRatings, type SkillMatchInput } from "@boardgames/core/skill/fit";
import { highlightsFor } from "@boardgames/core/skill/highlights";
import { gameLeaderboards, traitStandings } from "@boardgames/core/skill/percentiles";
import { z } from "zod";
import { getDb } from "../db.ts";
import { jsonColumn, parseRow, parseRows } from "./db-rows.ts";
import { groupMatchUnits, unitResult } from "./match-units.ts";

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
  /**
   * Live win runs per visible player, longest first — the only non-fit fact
   * kept here. It rides along because the spotlight diff needs a before/after
   * for "who holds the longest run", and the state row IS the before.
   */
  streaks: z.array(z.object({ userId: z.string().min(1), length: z.number().int().min(1) })),
});
export type StoredSkillState = z.infer<typeof StoredSkillStateSchema>;

const StateRowSchema = z.object({
  payload_json: jsonColumn(StoredSkillStateSchema),
  input_fingerprint: z.string(),
  engine_fingerprint: z.string().nullable(),
  config_version: z.number(),
  computed_at: z.string(),
  // Read raw: a baseline written by an older payload schema must degrade to
  // "no baseline", never to a failed read of the CURRENT state.
  prev_payload_json: z.string().nullable(),
  prev_computed_at: z.string().nullable(),
  prev_config_version: z.number().nullable(),
});
type StateRow = z.infer<typeof StateRowSchema>;

const STATE_COLUMNS = `payload_json, input_fingerprint, engine_fingerprint, config_version,
   computed_at, prev_payload_json, prev_computed_at, prev_config_version`;

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
 * Hash over the maths: engine config version + every catalog skill vector.
 * Flipping this means the stored numbers came out of a different model, so
 * the state heals itself without waiting for anyone.
 */
function engineFingerprint(): string {
  const h = createHash("sha256");
  h.update(`config:${config.version}`);
  for (const entry of CATALOG) h.update(`|${entry.slug}:${JSON.stringify(entry.skills)}`);
  return h.digest("hex");
}

/**
 * Hash over the evidence: every match row's (id, last-write time). Deletions
 * change the row set, so they flip it too. Flipping this means the ratings are
 * behind the history — reported to the admin, never acted on automatically.
 */
function dataFingerprint(rows: readonly MatchRow[]): string {
  const h = createHash("sha256");
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

// ── Live win runs ──────────────────────────────────────────────────────

/**
 * Every visible player's live win run, longest first. Uses the same
 * campaign-aware `unitResult` the profile pages use, so "five straight" here
 * is the same five the member sees on their own match history.
 */
function computeStreaks(
  rows: readonly MatchRow[],
  visible: ReadonlySet<string>,
): { userId: string; length: number }[] {
  const chronological = [...rows].sort((a, b) =>
    a.played_at === b.played_at ? a.id - b.id : a.played_at < b.played_at ? -1 : 1,
  );
  const perUser = new Map<string, StreakResult[]>();
  for (const unit of groupMatchUnits(chronological)) {
    const lowestWins = lowScoreWinsForSlug(unit.rep.game_slug);
    // Participants are unioned across the campaign's sessions: someone who
    // only made session one is still part of the unit's single result.
    const participants = new Set(unit.rows.flatMap((r) => extractParticipantIds(r.outcome_json)));
    for (const userId of participants) {
      if (!visible.has(userId)) continue;
      const { result } = unitResult(unit.rep.outcome_json, userId, lowestWins, unit.rep.game_slug);
      if (result !== "win" && result !== "loss" && result !== "draw") continue;
      const list = perUser.get(userId);
      if (list) list.push(result);
      else perUser.set(userId, [result]);
    }
  }
  return [...perUser]
    .map(([userId, results]) => ({ userId, length: activeWinStreak(results) }))
    .filter((s) => s.length > 0)
    .sort((a, b) => (b.length !== a.length ? b.length - a.length : a.userId < b.userId ? -1 : 1));
}

// ── Recompute ──────────────────────────────────────────────────────────

async function loadMatchRows(): Promise<MatchRow[]> {
  const { rows } = await getDb().execute(
    `SELECT id, played_at, game_slug, outcome_json, updated_at, recorded_at
     FROM match_results ORDER BY id`,
  );
  return parseRows(MatchRowSchema, rows, "match_results.skill");
}

/**
 * How the run treats the baseline the spotlight diff compares against.
 *
 * - `rotate` — an admin run: the state being replaced becomes the baseline,
 *   so the diff describes what this run changed.
 * - `reset` — an engine heal: the freshly computed state becomes its own
 *   baseline. Rank moves caused by a config bump are the maths changing, not
 *   anyone playing, and announcing them would be a lie.
 */
type BaselineMode = "rotate" | "reset";

/**
 * The whole derivation, fit included, with no I/O — so a dry-run script can
 * replay history subsets through the exact production code path instead of a
 * lookalike. `visible` is everyone who may be SURFACED; guests and internal QA
 * aliases still take part in the fit, since their games carry real comparative
 * signal.
 */
export function buildSkillState(
  rows: readonly MatchRow[],
  visible: ReadonlySet<string>,
): StoredSkillState {
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
    streaks: computeStreaks(rows, visible),
  });

  return state;
}

async function recompute(
  rows: readonly MatchRow[],
  previous: StateRow | null,
  mode: BaselineMode,
): Promise<void> {
  const db = getDb();
  const userRows = parseRows(
    UserRowSchema,
    (await db.execute("SELECT id, guest, internal FROM user")).rows,
    "user.skill-flags",
  );
  const visible = new Set(
    userRows.filter((u) => u.guest === 0 && u.internal === 0).map((u) => u.id),
  );
  const state = buildSkillState(rows, visible);
  const players = state.players;

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

  const payload = JSON.stringify(state);
  // Rotate only across a like-for-like engine; otherwise the new state is its
  // own baseline and the next admin run gets a comparable diff.
  const rotate =
    mode === "rotate" && previous !== null && previous.config_version === config.version;
  const prevPayload = rotate ? JSON.stringify(previous.payload_json) : payload;
  const prevComputedAt = rotate ? previous.computed_at : null;

  await db.batch(
    [
      {
        sql: `INSERT INTO skill_rating_state (
                id, payload_json, input_fingerprint, engine_fingerprint, config_version,
                computed_at, prev_payload_json, prev_computed_at, prev_config_version)
              VALUES (1, ?, ?, ?, ?, datetime('now'), ?, COALESCE(?, datetime('now')), ?)
              ON CONFLICT(id) DO UPDATE SET
                payload_json = excluded.payload_json,
                input_fingerprint = excluded.input_fingerprint,
                engine_fingerprint = excluded.engine_fingerprint,
                config_version = excluded.config_version,
                computed_at = excluded.computed_at,
                prev_payload_json = excluded.prev_payload_json,
                prev_computed_at = excluded.prev_computed_at,
                prev_config_version = excluded.prev_config_version`,
        args: [
          payload,
          dataFingerprint(rows),
          engineFingerprint(),
          config.version,
          prevPayload,
          prevComputedAt,
          config.version,
        ],
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

async function readStateRow(): Promise<StateRow | null> {
  const { rows } = await getDb().execute(
    `SELECT ${STATE_COLUMNS} FROM skill_rating_state WHERE id = 1`,
  );
  if (rows.length === 0) return null;
  try {
    return parseRow(StateRowSchema, rows[0], "skill_rating_state");
  } catch {
    // A payload written by an older schema is a STALE state, not an error.
    console.warn("[skill] stored state failed schema parse — recomputing");
    return null;
  }
}

/**
 * The stored baseline, or null when there isn't a comparable one. Refuses a
 * baseline fitted under a different config version and one that no longer
 * parses — in both cases the honest answer is "nothing to compare against".
 */
export function baselineOf(row: StateRow | null): StoredSkillState | null {
  if (!row?.prev_payload_json || row.prev_config_version !== config.version) return null;
  try {
    return StoredSkillStateSchema.parse(JSON.parse(row.prev_payload_json));
  } catch {
    return null;
  }
}

let inFlight: Promise<StoredSkillState | null> | null = null;

async function runRecompute(mode: BaselineMode): Promise<StoredSkillState | null> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const rows = await loadMatchRows();
      await recompute(rows, await readStateRow(), mode);
      return (await readStateRow())?.payload_json ?? null;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/**
 * The current skill state, healing it first only when the ENGINE moved out
 * from under it (no row, unparseable payload, or a config/catalog change).
 * A history change deliberately does NOT recompute here — the ratings stay on
 * the last published fit until an admin runs one.
 */
export async function ensureSkillState(): Promise<StoredSkillState | null> {
  if (inFlight) return inFlight;
  const row = await readStateRow();
  if (row && row.engine_fingerprint === engineFingerprint()) return row.payload_json;
  return runRecompute("reset");
}

/** Refit from scratch and rotate the baseline. The admin button's one job. */
export async function forceSkillRecompute(): Promise<StoredSkillState | null> {
  return runRecompute("rotate");
}

export type SkillRatingStatus = {
  state: StoredSkillState | null;
  baseline: StoredSkillState | null;
  computedAt: string | null;
  baselineComputedAt: string | null;
  configVersion: number | null;
  /** True when matches have been recorded or edited since the last run. */
  stale: boolean;
  matchesTotal: number;
  /** How many match rows were written or touched after the last run. */
  matchesChangedSince: number;
};

/** Everything the admin card needs to explain what a recompute would do. */
export async function skillRatingStatus(): Promise<SkillRatingStatus> {
  const [rows, row] = await Promise.all([loadMatchRows(), readStateRow()]);
  const computedAt = row?.computed_at ?? null;
  const changed = computedAt
    ? rows.filter((r) => (r.updated_at ?? r.recorded_at) > computedAt).length
    : rows.length;
  return {
    state: row?.payload_json ?? null,
    baseline: baselineOf(row),
    computedAt,
    baselineComputedAt: row?.prev_computed_at ?? null,
    configVersion: row?.config_version ?? null,
    stale: row === null || row.input_fingerprint !== dataFingerprint(rows),
    matchesTotal: rows.length,
    matchesChangedSince: changed,
  };
}

/**
 * Boot-time engine heal. Fire-and-forget: a failed recompute must never stop
 * the server from coming up, and the lazy check on read tries again.
 */
export function triggerSkillRecompute(): void {
  ensureSkillState().catch((err) => {
    console.error("[skill] recompute failed:", err);
  });
}

/** When the current ratings were fitted — shown wherever they are rendered. */
export async function skillComputedAt(): Promise<string | null> {
  return (await readStateRow())?.computed_at ?? null;
}
