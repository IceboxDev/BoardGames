// Display-scale derivations over a fitted result: Hazen percentiles, per-trait
// standings, and the gated leaderboards. Raw θ is a zero-centered log-odds
// scale — meaningless to users — so every displayed value is a percentile
// among *visible eligible* players (the server passes the visible set:
// eligible minus guests/internal accounts).

import { SKILL_TRAIT_IDS, type SkillTraitId } from "../protocol/http/skills.ts";
import { SKILL_CONFIG_V1, type SkillConfig } from "./config.ts";
import type { SkillFitResult } from "./fit.ts";

/** Hazen plotting position mapped to 0–100 (rank 1 = best; no 0/100 endpoints). */
export function hazenPercentile(rank: number, n: number): number {
  if (n <= 0) return 50;
  return ((n - rank + 0.5) / n) * 100;
}

/**
 * The displayed 1–100 skill score: the group's current best trait rating
 * maps to exactly 100 and the hardcoded `scoreFloorTheta` maps to 0, linear
 * in between. The ceiling is dynamic (someone always holds the 100) while
 * the floor is fixed, so a player falling below today's weakest never
 * rescales everyone else. Still rating-based, NOT rank-based — a player
 * leading every trait by different margins gets different scores.
 */
export function skillScore(
  theta: number,
  thetaMax: number,
  config: SkillConfig = SKILL_CONFIG_V1,
): number {
  const span = Math.max(thetaMax - config.scoreFloorTheta, 0.05);
  const raw = (100 * (theta - config.scoreFloorTheta)) / span;
  return Math.min(100, Math.max(1, Math.round(raw)));
}

/**
 * The literal win probability (in %) against an average-rated group member
 * on a pure-this-trait game: `100·σ(θ)`. Shown in tooltips beside the
 * scaled score.
 */
export function winChance(theta: number): number {
  return Math.min(99, Math.max(1, Math.round(100 / (1 + Math.exp(-theta)))));
}

export type TraitStanding = {
  userId: string;
  theta: number;
  se: number;
  exposure: number;
  /** 1-based rank among visible eligible players on this trait. */
  rank: number;
  /** Hazen percentile 0–100 among the same set. */
  percentile: number;
  /** Displayed 0–100 score (see `skillScore`); 0 when provisional. */
  score: number;
  /** Win probability (%) vs an average-rated member (see `winChance`). */
  winChance: number;
  /** True when the player's exposure on this axis is below `minExposure`. */
  provisional: boolean;
};

export type TraitStandings = Record<SkillTraitId, TraitStanding[]>;

/**
 * Per-trait standings over visible eligible players, sorted best-first.
 * Deterministic order: θ desc, exposure desc, userId asc.
 */
export function traitStandings(
  fit: SkillFitResult,
  visibleIds: ReadonlySet<string>,
  config: SkillConfig = SKILL_CONFIG_V1,
): TraitStandings {
  const eligible = Object.entries(fit.players)
    .filter(([id, p]) => p.eligible && visibleIds.has(id))
    .sort(([a], [b]) => (a < b ? -1 : 1));

  // Dynamic ceiling: the best non-provisional trait rating in the group
  // (across ALL traits) is the θ that scores exactly 100.
  let thetaMax = Number.NEGATIVE_INFINITY;
  for (const [, p] of eligible) {
    for (const trait of SKILL_TRAIT_IDS) {
      const t = p.traits[trait];
      if (t.exposure >= config.minExposure && t.theta > thetaMax) thetaMax = t.theta;
    }
  }
  if (!Number.isFinite(thetaMax)) thetaMax = config.scoreFloorTheta + 1;

  const out = {} as TraitStandings;
  for (const trait of SKILL_TRAIT_IDS) {
    const sorted = [...eligible].sort(([aId, a], [bId, b]) => {
      const at = a.traits[trait];
      const bt = b.traits[trait];
      if (bt.theta !== at.theta) return bt.theta - at.theta;
      if (bt.exposure !== at.exposure) return bt.exposure - at.exposure;
      return aId < bId ? -1 : 1;
    });
    out[trait] = sorted.map(([id, p], i) => {
      const provisional = p.traits[trait].exposure < config.minExposure;
      return {
        userId: id,
        theta: p.traits[trait].theta,
        se: p.traits[trait].se,
        exposure: p.traits[trait].exposure,
        rank: i + 1,
        percentile: hazenPercentile(i + 1, sorted.length),
        // Provisional axes are "not computed yet" — they display as 0.
        score: provisional ? 0 : skillScore(p.traits[trait].theta, thetaMax, config),
        winChance: winChance(p.traits[trait].theta),
        provisional,
      };
    });
  }
  return out;
}

/**
 * A trait's leaderboard: the standings restricted to exposure-cleared players,
 * or null when fewer than `minLeaderboardPlayers` clear the bar — ranking
 * prior-noise (today: Dexterity) would fabricate a champion.
 */
export function traitLeaderboard(
  standings: TraitStanding[],
  config: SkillConfig = SKILL_CONFIG_V1,
): TraitStanding[] | null {
  const cleared = standings.filter((s) => !s.provisional);
  if (cleared.length < config.minLeaderboardPlayers) return null;
  return cleared.map((s, i) => ({
    ...s,
    rank: i + 1,
    percentile: hazenPercentile(i + 1, cleared.length),
  }));
}

export type GameStanding = {
  userId: string;
  /** Effective strength R(p,G) — the hidden per-game elo. */
  rating: number;
  matches: number;
  rank: number;
};

/**
 * Per-game "Best at …" boards. A board exists when the game has at least
 * `minGameBoardPlays` rated plays overall; entries need ≥2 plays (a single
 * play is pure prior) and the board needs ≥2 entries to be a comparison.
 */
export function gameLeaderboards(
  fit: SkillFitResult,
  visibleIds: ReadonlySet<string>,
  config: SkillConfig = SKILL_CONFIG_V1,
): Record<string, GameStanding[]> {
  const totalPlays = new Map<string, number>();
  const entries = new Map<string, { userId: string; rating: number; matches: number }[]>();
  for (const [id, p] of Object.entries(fit.players)) {
    for (const [slug, game] of Object.entries(p.games)) {
      totalPlays.set(slug, (totalPlays.get(slug) ?? 0) + game.matches);
      if (!visibleIds.has(id) || !p.eligible || game.matches < 2) continue;
      const list = entries.get(slug) ?? [];
      list.push({ userId: id, rating: game.rating, matches: game.matches });
      entries.set(slug, list);
    }
  }

  const out: Record<string, GameStanding[]> = {};
  for (const slug of [...entries.keys()].sort()) {
    if ((totalPlays.get(slug) ?? 0) < config.minGameBoardPlays) continue;
    const list = entries.get(slug) ?? [];
    if (list.length < 2) continue;
    list.sort((a, b) => {
      if (b.rating !== a.rating) return b.rating - a.rating;
      if (b.matches !== a.matches) return b.matches - a.matches;
      return a.userId < b.userId ? -1 : 1;
    });
    out[slug] = list.map((e, i) => ({ ...e, rank: i + 1 }));
  }
  return out;
}
