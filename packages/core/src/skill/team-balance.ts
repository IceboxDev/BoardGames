// Balanced teams for one game, from the rating engine's strengths.
//
// The fit (`fit.ts`) models a player's strength in game G as
//   R(p,G) = Σ_t w_{G,t}·θ_{p,t} + g_{p,G}
// and a team's strength as the MEAN of its members' — so balancing is: split
// the table into teams of near-equal size whose mean strengths are as close
// as possible. The win chances shown for a split use the same Bradley–Terry
// model the ratings were fitted with (k-way: e^{R_i} / Σ e^{R_j}).
//
// Search: two teams of up to EXACT_LIMIT players are enumerated exhaustively;
// anything larger runs a seeded multi-start swap descent. Either way every
// split within TOLERANCE of the best found is a candidate and the seed picks
// one, so "another balanced split" shows a different, equally fair table
// instead of the same one forever.

import { skillProfileBySlug } from "../games/skill-profiles.ts";
import { createRng, type Rng, shuffle } from "../lib/rng.ts";
import { SKILL_TRAIT_IDS, type SkillTraitId } from "../protocol/http/skills.ts";

/** What the balancer needs from a player's fit (a subset of `PlayerSkillFit`). */
export type StrengthSource = {
  traits: Record<SkillTraitId, { theta: number }>;
  games: Record<string, { offset: number; matches: number }>;
};

/** How a player's strength in the game was known. */
export type StrengthBasis = "game" | "traits" | "unknown";

/**
 * R(p,G): the trait mix the game weighs, plus the player's own offset in it
 * when they have played it. An off-catalog game weighs the six traits evenly.
 * A player the fit has never seen is the prior: 0, an average player.
 */
export function gameStrength(
  player: StrengthSource | undefined,
  slug: string,
): { strength: number; basis: StrengthBasis } {
  if (!player) return { strength: 0, basis: "unknown" };
  const weights = skillProfileBySlug(slug);
  let base = 0;
  for (const t of SKILL_TRAIT_IDS) {
    const w = weights ? weights[t] / 100 : 1 / SKILL_TRAIT_IDS.length;
    base += w * player.traits[t].theta;
  }
  const game = player.games[slug];
  return game && game.matches > 0
    ? { strength: base + game.offset, basis: "game" }
    : { strength: base, basis: "traits" };
}

/** Team sizes for `n` players in `k` teams: as even as possible, bigger first. */
export function teamSizes(n: number, k: number): number[] {
  const count = Math.max(1, Math.min(k, n));
  const base = Math.floor(n / count);
  return Array.from({ length: count }, (_, i) => base + (i < n % count ? 1 : 0));
}

/** Each team's Bradley–Terry chance to come out on top. */
export function teamChances(strengths: readonly number[]): number[] {
  const top = Math.max(...strengths);
  const e = strengths.map((s) => Math.exp(s - top));
  const sum = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / sum);
}

export type BalancedTeams = {
  teams: string[][];
  /** Mean strength per team, in the fit's log-odds units. */
  strengths: number[];
  /** Chance per team to win (sums to 1). */
  chances: number[];
  /** Strongest minus weakest team — 0 is a perfect split. */
  spread: number;
};

/** Splits within this of the best (log-odds; ≈ 51 : 49 for two teams) count as equally fair. */
export const TOLERANCE = 0.04;
/** Two teams of up to this many players are searched exhaustively (C(16,8) = 12 870). */
export const EXACT_LIMIT = 16;
const RESTARTS = 48;

type Split = { assign: number[]; spread: number; variance: number };

function score(assign: readonly number[], r: readonly number[], k: number) {
  const sum = new Array<number>(k).fill(0);
  const size = new Array<number>(k).fill(0);
  assign.forEach((t, i) => {
    sum[t] += r[i];
    size[t] += 1;
  });
  const means = sum.map((s, t) => s / size[t]);
  const avg = means.reduce((a, b) => a + b, 0) / k;
  return {
    means,
    spread: Math.max(...means) - Math.min(...means),
    variance: means.reduce((a, m) => a + (m - avg) ** 2, 0),
  };
}

/** Canonical key: team labels renumbered by first appearance, so relabellings dedupe. */
function keyOf(assign: readonly number[]): string {
  const map = new Map<number, number>();
  return assign
    .map((t) => {
      if (!map.has(t)) map.set(t, map.size);
      return map.get(t);
    })
    .join("");
}

function exactTwo(r: readonly number[], sizes: readonly number[]): Split[] {
  const n = r.length;
  const [a] = sizes;
  const out: Split[] = [];
  // Equal halves: pin player 0 to team 0 so each split is visited once.
  const pin = sizes[0] === sizes[1];
  const pick: number[] = [];
  const walk = (start: number) => {
    if (pick.length === a) {
      const assign = new Array<number>(n).fill(1);
      for (const i of pick) assign[i] = 0;
      const s = score(assign, r, 2);
      out.push({ assign, spread: s.spread, variance: s.variance });
      return;
    }
    for (let i = start; i <= n - (a - pick.length); i++) {
      if (pin && pick.length === 0 && i > 0) break;
      pick.push(i);
      walk(i + 1);
      pick.pop();
    }
  };
  walk(0);
  return out;
}

function descend(r: readonly number[], sizes: readonly number[], rng: Rng): Split {
  const k = sizes.length;
  const order = shuffle(
    r.map((_, i) => i),
    rng,
  );
  const assign = new Array<number>(r.length);
  let cursor = 0;
  sizes.forEach((size, t) => {
    for (let j = 0; j < size; j++) assign[order[cursor++]] = t;
  });
  let cur = score(assign, r, k);
  for (;;) {
    let best: { i: number; j: number; variance: number } | null = null;
    for (let i = 0; i < r.length; i++) {
      for (let j = i + 1; j < r.length; j++) {
        if (assign[i] === assign[j]) continue;
        [assign[i], assign[j]] = [assign[j], assign[i]];
        const s = score(assign, r, k);
        [assign[i], assign[j]] = [assign[j], assign[i]];
        if (s.variance < (best?.variance ?? cur.variance) - 1e-12)
          best = { i, j, variance: s.variance };
      }
    }
    if (!best) break;
    [assign[best.i], assign[best.j]] = [assign[best.j], assign[best.i]];
    cur = score(assign, r, k);
  }
  return { assign: [...assign], spread: cur.spread, variance: cur.variance };
}

/**
 * The fairest split of `ids` into `teamCount` teams by `strengthOf`, one of
 * the near-best chosen by `seed`. Team sizes differ by at most one.
 */
export function balanceTeams(
  ids: readonly string[],
  teamCount: number,
  strengthOf: (id: string) => number,
  seed: number,
): BalancedTeams {
  const sizes = teamSizes(ids.length, teamCount);
  const k = sizes.length;
  const rng = createRng(seed);
  if (ids.length === 0) return { teams: [], strengths: [], chances: [], spread: 0 };
  const r = ids.map(strengthOf);

  let splits: Split[];
  if (k === 2 && ids.length <= EXACT_LIMIT) splits = exactTwo(r, sizes);
  else if (k === 1) splits = [{ assign: ids.map(() => 0), spread: 0, variance: 0 }];
  else splits = Array.from({ length: RESTARTS }, () => descend(r, sizes, rng));

  const unique = new Map<string, Split>();
  for (const s of splits) unique.set(keyOf(s.assign), s);
  const best = Math.min(...[...unique.values()].map((s) => s.spread));
  const fair = [...unique.values()]
    .filter((s) => s.spread <= best + TOLERANCE)
    .sort((a, b) => (keyOf(a.assign) < keyOf(b.assign) ? -1 : 1));
  const chosen = fair[Math.floor(rng() * fair.length)];

  // Which team is "Team 1" is arbitrary too — shuffle the labels.
  const labels = shuffle(
    sizes.map((_, t) => t),
    rng,
  );
  const teams: string[][] = sizes.map(() => []);
  chosen.assign.forEach((t, i) => {
    teams[labels[t]].push(ids[i]);
  });
  const strengths = teams.map((team) => {
    const sum = team.reduce((a, id) => a + r[ids.indexOf(id)], 0);
    return sum / team.length;
  });
  return {
    teams,
    strengths,
    chances: teamChances(strengths),
    spread: Math.max(...strengths) - Math.min(...strengths),
  };
}
