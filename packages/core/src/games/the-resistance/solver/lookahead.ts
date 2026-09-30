/**
 * Game-level lookahead: who wins from here, if the TABLE plays on.
 *
 * A decision's worth is not one mission's odds but the game it leads to.
 * From any public position, "table play" continues the game: each remaining
 * mission is run with the team the table rates best (ties shared out evenly),
 * each spy aboard plays Fail with the Solver's usual chance (every Fail count
 * weighed), and the table updates its beliefs from the Fail
 * count before the next mission. In a given world (a set of spies) that is
 * computed exactly, with no random playouts:
 *
 *   value(position, world) = P(the Resistance reaches three successes)
 *
 * A decider's option is then weighed over the worlds they consider possible:
 * for a Resistance leader, their own view; for the whole game's
 * "is it still winnable?", the truth. When the table's best team for a mission
 * contains a spy in the true world, the Resistance has lost on information —
 * no table-arguable play wins it — and the decisions that led there show up as
 * the ones that lost the game's value.
 */

import type { ResistanceRecord } from "../record";
import {
  combinations,
  failsNeeded,
  maskOf,
  openMissions,
  popcount,
  tablePosition,
  teamSize,
  WINS_NEEDED,
} from "../rules";
import { type ModelEnv, spyFailChance } from "./model";
import type { Analysis } from "./posterior";
import { successChance } from "./recommend";
import { recordUpTo } from "./simulate";

/** P(success) within this counts as a tie. */
const TIE = 0.005;
/**
 * Tied table favourites are shared out evenly for the next few missions
 * (exact and symmetric where it matters most — right after the decision);
 * further ahead the table's first favourite is played. For a fixed seating
 * that keeps the future a handful of paths instead of an explosion.
 */
function tieLevels(n: number): number {
  return n <= 6 ? 5 : n <= 7 ? 2 : 1;
}
const MAX_TIES_LARGE = 8;

export interface Position {
  /** A key unique to the public history since the root. */
  key: string;
  /** The table's posterior over worlds, normalised. */
  weights: Float64Array;
  results: (boolean | null)[];
  successes: number;
  fails: number;
}

export interface TeamChoice {
  mission: number;
  mask: number;
}

function situationOf(p: Position) {
  return { successes: p.successes, fails: p.fails, rejections: 0 };
}

function binomial(n: number, k: number): number {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

export class Lookahead {
  private readonly worlds: readonly number[];
  private readonly n: number;
  private readonly env: ModelEnv;
  private readonly targeting: boolean;
  private readonly teamsBySize = new Map<number, number[]>();
  private readonly favourites = new Map<string, TeamChoice[]>();
  private readonly children = new Map<string, Position>();
  private readonly values = new Map<string, number>();

  constructor(analysis: Analysis, record: ResistanceRecord, env: ModelEnv) {
    this.worlds = analysis.worlds;
    this.n = analysis.playerCount;
    this.env = env;
    this.targeting = record.variants.targeting;
  }

  private teams(size: number): number[] {
    let t = this.teamsBySize.get(size);
    if (!t) {
      t = combinations(this.n, size).map(maskOf);
      this.teamsBySize.set(size, t);
    }
    return t;
  }

  /** P(success | k spies aboard) for each k, at a position's score. */
  private successTable(p: Position, mission: number): number[] {
    const needed = failsNeeded(this.n, mission);
    const size = teamSize(this.n, mission);
    const table = [1];
    for (let k = 1; k <= size; k++) {
      table[k] = successChance(
        k,
        needed,
        spyFailChance(
          { mission, teamSize: size, spiesOnTeam: k, situation: situationOf(p) },
          this.env,
        ).chance,
      );
    }
    return table;
  }

  /** The team(s) the table rates best for the next mission. */
  favouritesAt(p: Position, all = true): TeamChoice[] {
    const cacheKey = `${p.key}${all ? "" : "!"}`;
    const cached = this.favourites.get(cacheKey);
    if (cached) return cached;
    const missions = openMissions(p.results, p.successes, this.targeting);
    // Only seatings still possible matter.
    const alive: number[] = [];
    const weight: number[] = [];
    for (let i = 0; i < this.worlds.length; i++) {
      const w = p.weights[i] ?? 0;
      if (w > 0) {
        alive.push(this.worlds[i] ?? 0);
        weight.push(w);
      }
    }
    // At 8+ players, search teams drawn from the least-suspected seats only
    // (team size + 3 of them): the table's favourite essentially never seats
    // its most suspected players, and it cuts 252 teams to 56 at ten.
    let pool = (1 << this.n) - 1;
    if (this.n >= 8) {
      const pSpy = Array.from({ length: this.n }, (_, seat) => {
        let q = 0;
        for (let j = 0; j < alive.length; j++)
          if ((alive[j] ?? 0) & (1 << seat)) q += weight[j] ?? 0;
        return q;
      });
      const size = Math.max(...missions.map((m) => teamSize(this.n, m)));
      const trusted = Array.from({ length: this.n }, (_, s) => s)
        .sort((a, b) => (pSpy[a] ?? 0) - (pSpy[b] ?? 0))
        .slice(0, size + 3);
      pool = maskOf(trusted);
    }
    let best = -1;
    let bestClean = -1;
    let tied: TeamChoice[] = [];
    for (const mission of missions) {
      const succ = this.successTable(p, mission);
      for (const mask of this.teams(teamSize(this.n, mission))) {
        if ((mask & pool) !== mask) continue;
        let s = 0;
        let c = 0;
        for (let j = 0; j < alive.length; j++) {
          const k = popcount((alive[j] ?? 0) & mask);
          const w = weight[j] ?? 0;
          s += w * (succ[k] ?? 0);
          if (k === 0) c += w;
        }
        if (s > best + TIE || (s > best - TIE && c > bestClean + TIE)) {
          best = Math.max(s, best);
          bestClean = c;
          tied = [{ mission, mask }];
        } else if (s > best - TIE && c > bestClean - TIE) {
          tied.push({ mission, mask });
        }
      }
    }
    // Share out evenly among the tied teams (a spread of them at large tables).
    const cap = !all ? 1 : this.n <= 7 ? tied.length : MAX_TIES_LARGE;
    const step = Math.max(1, Math.floor(tied.length / cap));
    const out = tied.filter((_, i) => i % step === 0).slice(0, cap);
    this.favourites.set(cacheKey, out);
    return out;
  }

  /** The position after `choice` is run and draws `fails` Fail cards. */
  after(p: Position, choice: TeamChoice, fails: number): Position {
    const key = `${p.key}|${choice.mission}:${choice.mask}:${fails}`;
    const cached = this.children.get(key);
    if (cached) return cached;
    // P(this many Fails | k spies aboard), each spy failing independently.
    const size = popcount(choice.mask);
    const likelihood: number[] = [];
    for (let k = 0; k <= size; k++) {
      if (fails > k) {
        likelihood[k] = 0;
        continue;
      }
      const q =
        k === 0
          ? 0
          : spyFailChance(
              {
                mission: choice.mission,
                teamSize: size,
                spiesOnTeam: k,
                situation: situationOf(p),
              },
              this.env,
            ).chance;
      likelihood[k] = binomial(k, fails) * q ** fails * (1 - q) ** (k - fails);
    }
    const weights = new Float64Array(this.worlds.length);
    let sum = 0;
    for (let i = 0; i < this.worlds.length; i++) {
      const w = p.weights[i] ?? 0;
      if (w === 0) continue;
      const v = w * (likelihood[popcount((this.worlds[i] ?? 0) & choice.mask)] ?? 0);
      weights[i] = v;
      sum += v;
    }
    if (sum === 0) {
      // Only the cards' hard constraint left standing: spread evenly over it.
      for (let i = 0; i < this.worlds.length; i++) {
        const k = popcount((this.worlds[i] ?? 0) & choice.mask);
        const ok = (p.weights[i] ?? 0) > 0 && fails <= k;
        weights[i] = ok ? 1 : 0;
        sum += weights[i] ?? 0;
      }
    }
    if (sum > 0) for (let i = 0; i < weights.length; i++) weights[i] = (weights[i] ?? 0) / sum;
    const success = fails < failsNeeded(this.n, choice.mission);
    const results = [...p.results];
    results[choice.mission] = success;
    const child: Position = {
      key,
      weights,
      results,
      successes: p.successes + (success ? 1 : 0),
      fails: p.fails + (success ? 0 : 1),
    };
    this.children.set(key, child);
    return child;
  }

  /**
   * Run `choice` in `world`, then play on. Each spy aboard decides on their
   * own whether to Fail — with the same chance the rest of the Solver assumes
   * (spies can't coordinate) — so every possible Fail count is weighed.
   */
  valueOf(p: Position, choice: TeamChoice, world: number, level = 0): number {
    const spies = popcount(world & choice.mask);
    if (spies === 0) return this.value(this.after(p, choice, 0), world, level);
    const q = spyFailChance(
      {
        mission: choice.mission,
        teamSize: popcount(choice.mask),
        spiesOnTeam: spies,
        situation: situationOf(p),
      },
      this.env,
    ).chance;
    let v = 0;
    for (let f = 0; f <= spies; f++) {
      const pf = binomial(spies, f) * q ** f * (1 - q) ** (spies - f);
      if (pf > 0) v += pf * this.value(this.after(p, choice, f), world, level);
    }
    return v;
  }

  /** P(Resistance wins) from `p` in `world`, the table playing its favourites. */
  value(p: Position, world: number, level = 0): number {
    if (p.successes >= WINS_NEEDED) return 1;
    if (p.fails >= WINS_NEEDED) return 0;
    const share = level < tieLevels(this.n);
    const key = `${p.key}#${world}#${share ? level : "x"}`;
    const cached = this.values.get(key);
    if (cached !== undefined) return cached;
    const favs = this.favouritesAt(p, share);
    let v = 0;
    for (const f of favs) v += this.valueOf(p, f, world, level + 1);
    v /= Math.max(1, favs.length);
    this.values.set(key, v);
    return v;
  }

  /** Σ over worlds of weight × f(world). */
  expect(weights: Float64Array, f: (world: number) => number): number {
    let total = 0;
    let mass = 0;
    for (let i = 0; i < this.worlds.length; i++) {
      const w = weights[i] ?? 0;
      if (w === 0) continue;
      total += w * f(this.worlds[i] ?? 0);
      mass += w;
    }
    return mass > 0 ? total / mass : 0;
  }

  /** The weights restricted to worlds a seat's knowledge allows. */
  seatView(weights: Float64Array, seat: number, knownSpies: readonly number[], spy: boolean) {
    const known = maskOf(knownSpies);
    const out = new Float64Array(weights.length);
    for (let i = 0; i < this.worlds.length; i++) {
      const world = this.worlds[i] ?? 0;
      const isSpy = (world & (1 << seat)) !== 0;
      out[i] = isSpy === spy && (world & known) === known ? (weights[i] ?? 0) : 0;
    }
    return out;
  }

  /** The single world where exactly these seats are spies. */
  truthView(spies: readonly number[]): Float64Array {
    const mask = maskOf(spies);
    return Float64Array.from(this.worlds, (w) => (w === mask ? 1 : 0));
  }
}

/** A root position from an analysis snapshot and the table position it describes. */
export function positionAt(
  weights: Float64Array,
  results: readonly (boolean | null)[],
  key = "root",
): Position {
  return {
    key,
    weights: Float64Array.from(weights),
    results: [...results],
    successes: results.filter((r) => r === true).length,
    fails: results.filter((r) => r === false).length,
  };
}

export interface GameValuePoint {
  /** Events applied (the position just before the event at this index). */
  count: number;
  /** P(Resistance wins) by the table's view, the table playing on. */
  table: number;
  /** The same with the real seating — 0 means lost on information. */
  truth: number | null;
}

/**
 * The game's value before each proposal and at the end: the table's own
 * estimate, and (with roles known) the value with the real seating.
 */
export function gameValueCurve(
  record: ResistanceRecord,
  analysis: Analysis,
  env: ModelEnv,
): GameValuePoint[] {
  const look = new Lookahead(analysis, record, env);
  const truth = record.roles
    ? maskOf(record.roles.flatMap((r, i) => (r === "spy" ? [i] : [])))
    : null;
  const counts = analysis.events.filter((e) => e.kind === "proposal").map((e) => e.index);
  counts.push(analysis.events.length);
  return counts.map((count) => {
    const snap = analysis.snapshots[count];
    const results = tablePosition(recordUpTo(record, analysis.events, count)).missionResults;
    if (!snap) return { count, table: 0, truth: null };
    const position = positionAt(snap.weights, results, `c${count}`);
    return {
      count,
      table: look.expect(snap.weights, (w) => look.value(position, w)),
      truth: truth === null ? null : look.value(position, truth),
    };
  });
}
