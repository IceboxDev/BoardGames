// The rating fit: batch MAP estimation of six-trait player ratings from full
// match history.
//
// Model: a player's effective strength in game G is
//   R(p,G) = Σ_t w_{G,t}·θ_{p,t} + g_{p,G}
// with fixed catalog weights w (normalized to sum 1), per-player trait vector
// θ, and a per-(player, game) offset g. Every match reduces to pairwise
// Bradley–Terry comparisons between sides (see `comparisons.ts`); co-op sides
// play a fitted per-game baseline d_G. We maximize
//   Σ ω·λ·log P(outcome) − κ_θ Σθ² − κ_g Σg² − κ_d Σd²
// which is strictly concave in all parameters (logistic likelihood linear in
// the parameters + strict L2), so the optimum is unique and the fit is fully
// deterministic and order-independent. Damped Newton converges in a handful of
// iterations at club scale (hundreds of matches, dozens of players).
//
// The κ_g ≪ κ_θ split is what stops single-game farming: dominance in one game
// is cheapest to explain via that game's g, while consistent dominance across
// many games sharing a trait is cheapest via θ.

import { skillProfileBySlug } from "../games/skill-profiles.ts";
import { coopScorePoolKey, coopScorePoolValue } from "../history/coop-challenge.ts";
import type { MatchOutcome } from "../protocol/http/history.ts";
import { SKILL_TRAIT_IDS, type SkillTraitId } from "../protocol/http/skills.ts";
import {
  matchEvidence,
  type ScoredCoopSession,
  type SkillComparison,
  scoredCoopEvidence,
} from "./comparisons.ts";
import { SKILL_CONFIG_V1, type SkillConfig } from "./config.ts";

export type SkillMatchInput = {
  /** Catalog slug; off-catalog slugs are skipped (and counted). */
  slug: string | null;
  /** Loose ISO timestamp; only used for the decay weight. */
  playedAt: string;
  /**
   * The (representative) outcome. For campaign units the caller promotes a
   * back-filled `campaignResult` onto `outcome` first.
   */
  outcome: MatchOutcome;
};

export type PlayerTraitFit = {
  /** Raw rating in natural log-odds units, prior-centered at 0. */
  theta: number;
  /** Posterior standard error (from the inverse Hessian diagonal). */
  se: number;
  /** Decayed evidence mass Σ λ·w_t for this trait. */
  exposure: number;
};

export type PlayerGameFit = {
  /** Effective strength R(p,G) = w_G·θ_p + g_{p,G} — the hidden per-game elo. */
  rating: number;
  /** The game-specific component g alone. */
  offset: number;
  /** Rated matches of this game the player appeared in. */
  matches: number;
};

export type PlayerSkillFit = {
  traits: Record<SkillTraitId, PlayerTraitFit>;
  games: Record<string, PlayerGameFit>;
  ratedMatches: number;
  distinctGames: number;
  eligible: boolean;
};

export type SkillFitResult = {
  players: Record<string, PlayerSkillFit>;
  /** Fitted co-op baseline strength per game (higher = harder game). */
  coopDifficulty: Record<string, number>;
  /** Matches dropped because their slug has no catalog skill vector. */
  skippedOffCatalog: number;
  /**
   * Matches that parsed but carried no evidence (unresolved co-ops, a game's
   * ONLY scored co-op session, single-participant rows…). Scored co-ops with
   * ≥2 comparable sessions of the same game DO rate (cross-session score
   * comparisons) and are not counted here.
   */
  skippedNoEvidence: number;
  newestPlayedAt: string | null;
  iterations: number;
  converged: boolean;
};

type PreparedMatch = {
  slug: string;
  /** Normalized trait weights (sum 1) in SKILL_TRAIT_IDS order. */
  w: number[];
  lambda: number;
  competitors: string[];
  comparisons: SkillComparison[];
};

/** Sparse linear term: d = Σ coef_k · x_{idx_k} − bias. */
type Term = {
  idx: number[];
  coef: number[];
  score: number;
  /** ω·λ — the term's total evidence weight. */
  w: number;
  /**
   * Constant added to side B's strength (challenge steps × config step): the
   * co-op virtual opponent playing above its fitted baseline at higher
   * difficulty tiers. A constant offset keeps the objective strictly concave.
   */
  bias: number;
};

function logSigmoid(x: number): number {
  // -softplus(-x), numerically stable on both tails.
  return x >= 0 ? -Math.log1p(Math.exp(-x)) : x - Math.log1p(Math.exp(x));
}

function sigmoid(x: number): number {
  return x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x));
}

/** Cholesky factorization of a symmetric positive-definite matrix, in place. */
function cholesky(h: Float64Array, n: number): void {
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = h[i * n + j];
      for (let k = 0; k < j; k++) sum -= h[i * n + k] * h[j * n + k];
      if (i === j) {
        // The ridge (2κ on every diagonal) guarantees positivity; a failure
        // here means a bug upstream, not bad data.
        if (sum <= 0) throw new Error("skill fit: Hessian lost positive-definiteness");
        h[i * n + i] = Math.sqrt(sum);
      } else {
        h[i * n + j] = sum / (h[j * n + j] ?? 1);
      }
    }
  }
}

/** Solve L·Lᵀ·x = b given the Cholesky factor L (lower triangle of `h`). */
function choleskySolve(h: Float64Array, n: number, b: Float64Array): Float64Array {
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let sum = b[i];
    for (let k = 0; k < i; k++) sum -= h[i * n + k] * y[k];
    y[i] = sum / h[i * n + i];
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let sum = y[i];
    for (let k = i + 1; k < n; k++) sum -= h[k * n + i] * x[k];
    x[i] = sum / h[i * n + i];
  }
  return x;
}

export function fitSkillRatings(
  matches: readonly SkillMatchInput[],
  config: SkillConfig = SKILL_CONFIG_V1,
): SkillFitResult {
  // ── 1. Reduce matches to evidence ─────────────────────────────────────
  let skippedOffCatalog = 0;
  let skippedNoEvidence = 0;
  const prepared: PreparedMatch[] = [];
  let newestMs = Number.NEGATIVE_INFINITY;
  let newestPlayedAt: string | null = null;

  const rawPrepared: (Omit<PreparedMatch, "lambda"> & { playedAtMs: number })[] = [];
  // Scored co-op sessions, pooled by comparability key — plain scored co-ops
  // pool by slug; margin co-ops (Quiztopia) additionally split by difficulty
  // tier + mode, and their pooled scalar is the WIN MARGIN, so two wins (or
  // two losses) of the same challenge get compared by how strongly they went
  // (see history/coop-challenge.ts). Their evidence is CROSS-session, so
  // pools reduce after the loop. `alsoRated` marks sessions that already
  // produced their own evidence (a co-op carrying both outcome AND score) so
  // they aren't double-counted in the per-player accounting.
  const scoredPools = new Map<
    string,
    {
      slug: string;
      w: number[];
      sessions: (ScoredCoopSession & {
        playedAt: string;
        playedAtMs: number;
        alsoRated: boolean;
      })[];
    }
  >();
  for (const m of matches) {
    const weights = m.slug === null ? undefined : skillProfileBySlug(m.slug);
    if (m.slug === null || weights === undefined) {
      skippedOffCatalog++;
      continue;
    }
    const w = SKILL_TRAIT_IDS.map((t) => weights[t] / 100);
    const playedAtMs = Date.parse(m.playedAt);
    const ms = Number.isNaN(playedAtMs) ? 0 : playedAtMs;
    const evidence = matchEvidence(m.slug, m.outcome);
    const poolValue =
      m.outcome.kind === "coop" && m.outcome.participants.length > 0
        ? coopScorePoolValue(m.slug, m.outcome)
        : null;
    const scored = poolValue !== null;
    if (scored && m.outcome.kind === "coop") {
      const key = coopScorePoolKey(m.slug, m.outcome);
      const pool = scoredPools.get(key) ?? { slug: m.slug, w, sessions: [] };
      pool.sessions.push({
        members: m.outcome.participants.map((p) => p.userId),
        score: poolValue,
        lambda: 1, // filled in once the decay anchor is known
        playedAt: m.playedAt,
        playedAtMs: ms,
        alsoRated: evidence !== null && evidence.comparisons.length > 0,
      });
      scoredPools.set(key, pool);
    }
    if (evidence === null || evidence.comparisons.length === 0) {
      if (!scored) skippedNoEvidence++;
      continue;
    }
    if (ms > newestMs) {
      newestMs = ms;
      newestPlayedAt = m.playedAt;
    }
    rawPrepared.push({
      slug: m.slug,
      w,
      competitors: evidence.competitors,
      comparisons: evidence.comparisons,
      playedAtMs: ms,
    });
  }

  // A lone scored session of a game has nothing to compare against — it stays
  // unrated, exactly like before. Same for a pool whose sessions all share one
  // identical roster (every pair is skipped as informationless). Pools that
  // yield real comparisons DO rate, and their sessions join the decay-anchor
  // pool.
  for (const [key, pool] of scoredPools) {
    if (scoredCoopEvidence(pool.slug, pool.sessions).length === 0) {
      scoredPools.delete(key);
      skippedNoEvidence += pool.sessions.filter((s) => !s.alsoRated).length;
      continue;
    }
    for (const s of pool.sessions) {
      if (s.playedAtMs > newestMs) {
        newestMs = s.playedAtMs;
        newestPlayedAt = s.playedAt;
      }
    }
  }

  // Decay is anchored to the newest match so the fit is a pure function of
  // the history (recomputing tomorrow with no new matches changes nothing).
  const msPerDay = 86_400_000;
  const lambdaOf = (playedAtMs: number): number => {
    const ageDays = newestMs === Number.NEGATIVE_INFINITY ? 0 : (newestMs - playedAtMs) / msPerDay;
    return 0.5 ** (Math.max(0, ageDays) / config.halfLifeDays);
  };
  for (const m of rawPrepared) {
    prepared.push({ ...m, lambda: lambdaOf(m.playedAtMs) });
  }

  // Scored co-op pools: one accounting entry per session (exposure, rated-
  // match and per-game counts — no comparisons of its own), then one synthetic
  // entry carrying the cross-session comparisons (pair decay is folded into
  // each comparison's weight, so its λ is 1).
  for (const key of [...scoredPools.keys()].sort()) {
    const pool = scoredPools.get(key) as NonNullable<ReturnType<typeof scoredPools.get>>;
    const sessions = pool.sessions.map((s) => ({ ...s, lambda: lambdaOf(s.playedAtMs) }));
    for (const s of sessions) {
      if (s.alsoRated) continue; // already accounted via its own outcome
      prepared.push({
        slug: pool.slug,
        w: pool.w,
        lambda: s.lambda,
        competitors: s.members,
        comparisons: [],
      });
    }
    prepared.push({
      slug: pool.slug,
      w: pool.w,
      lambda: 1,
      competitors: [],
      comparisons: scoredCoopEvidence(pool.slug, sessions),
    });
  }

  // ── 2. Index parameters (sorted for determinism) ──────────────────────
  const playerIds = [...new Set(prepared.flatMap((m) => m.competitors))].sort();
  const playerIdx = new Map(playerIds.map((id, i) => [id, i]));
  const T = SKILL_TRAIT_IDS.length;

  const gameKeys = [
    ...new Set(prepared.flatMap((m) => m.competitors.map((id) => `${id} ${m.slug}`))),
  ].sort();
  const gameIdx = new Map(gameKeys.map((k, i) => [k, playerIds.length * T + i]));

  const coopSlugs = [
    ...new Set(prepared.filter((m) => m.comparisons.some((c) => c.b === null)).map((m) => m.slug)),
  ].sort();
  const coopIdx = new Map(coopSlugs.map((s, i) => [s, playerIds.length * T + gameKeys.length + i]));

  const n = playerIds.length * T + gameKeys.length + coopSlugs.length;
  const kappa = new Float64Array(n);
  kappa.fill(config.kTheta, 0, playerIds.length * T);
  kappa.fill(config.kGame, playerIds.length * T, playerIds.length * T + gameKeys.length);
  kappa.fill(config.kCoop, playerIds.length * T + gameKeys.length, n);

  // ── 3. Build sparse comparison terms ──────────────────────────────────
  const terms: Term[] = [];
  for (const m of prepared) {
    for (const c of m.comparisons) {
      const coefs = new Map<number, number>();
      const addSide = (members: string[] | null, sign: number) => {
        if (members === null) {
          const di = coopIdx.get(m.slug);
          if (di !== undefined) coefs.set(di, (coefs.get(di) ?? 0) + sign);
          return;
        }
        const share = sign / members.length;
        for (const id of members) {
          const pi = playerIdx.get(id);
          if (pi === undefined) continue;
          for (let t = 0; t < T; t++) {
            const xi = pi * T + t;
            coefs.set(xi, (coefs.get(xi) ?? 0) + share * m.w[t]);
          }
          const gi = gameIdx.get(`${id} ${m.slug}`);
          if (gi !== undefined) coefs.set(gi, (coefs.get(gi) ?? 0) + share);
        }
      };
      addSide(c.a, 1);
      addSide(c.b, -1);
      const entries = [...coefs.entries()].sort((a, b) => a[0] - b[0]);
      terms.push({
        idx: entries.map((e) => e[0]),
        coef: entries.map((e) => e[1]),
        score: c.score,
        w: c.weight * m.lambda,
        bias: (c.biasSteps ?? 0) * config.coopChallengeStep,
      });
    }
  }

  // ── 4. Damped Newton ──────────────────────────────────────────────────
  const x = new Float64Array(n);

  const objective = (v: Float64Array): number => {
    let obj = 0;
    for (const t of terms) {
      let d = -t.bias;
      for (let k = 0; k < t.idx.length; k++) d += t.coef[k] * v[t.idx[k]];
      obj += t.w * (t.score * logSigmoid(d) + (1 - t.score) * logSigmoid(-d));
    }
    for (let i = 0; i < n; i++) obj -= kappa[i] * v[i] * v[i];
    return obj;
  };

  const buildGradHessian = (v: Float64Array, h: Float64Array): Float64Array => {
    const grad = new Float64Array(n);
    h.fill(0);
    for (const t of terms) {
      let d = -t.bias;
      for (let k = 0; k < t.idx.length; k++) d += t.coef[k] * v[t.idx[k]];
      const p = sigmoid(d);
      const resid = t.w * (t.score - p);
      const curv = t.w * p * (1 - p);
      for (let k = 0; k < t.idx.length; k++) {
        grad[t.idx[k]] += resid * t.coef[k];
        for (let l = 0; l < t.idx.length; l++) {
          h[t.idx[k] * n + t.idx[l]] += curv * t.coef[k] * t.coef[l];
        }
      }
    }
    for (let i = 0; i < n; i++) {
      grad[i] -= 2 * kappa[i] * v[i];
      h[i * n + i] += 2 * kappa[i];
    }
    return grad;
  };

  const h = new Float64Array(n * n);
  let iterations = 0;
  let converged = n === 0;
  let currentObj = objective(x);

  for (let iter = 0; iter < config.maxIter && !converged; iter++) {
    iterations = iter + 1;
    const grad = buildGradHessian(x, h);
    let maxAbs = 0;
    for (let i = 0; i < n; i++) maxAbs = Math.max(maxAbs, Math.abs(grad[i]));
    if (maxAbs < config.tol) {
      converged = true;
      break;
    }
    cholesky(h, n);
    const step = choleskySolve(h, n, grad);
    // Backtracking line search — Newton on a concave objective with a full
    // step almost always ascends, but damping makes it unconditionally safe.
    let scale = 1;
    for (let tries = 0; tries < 40; tries++) {
      const trial = new Float64Array(x);
      for (let i = 0; i < n; i++) trial[i] += scale * step[i];
      const trialObj = objective(trial);
      if (trialObj >= currentObj) {
        x.set(trial);
        currentObj = trialObj;
        break;
      }
      scale /= 2;
    }
  }

  // ── 5. Standard errors: inverse Hessian diagonal at the optimum ───────
  const se = new Float64Array(n);
  if (n > 0) {
    buildGradHessian(x, h);
    cholesky(h, n);
    const unit = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      unit.fill(0);
      unit[i] = 1;
      se[i] = Math.sqrt(choleskySolve(h, n, unit)[i]);
    }
  }

  // ── 6. Assemble per-player results ────────────────────────────────────
  const exposure = new Map<string, number[]>();
  const ratedMatches = new Map<string, number>();
  const gamesPlayed = new Map<string, Map<string, number>>();
  for (const m of prepared) {
    for (const id of new Set(m.competitors)) {
      const exp = exposure.get(id) ?? SKILL_TRAIT_IDS.map(() => 0);
      for (let t = 0; t < T; t++) exp[t] += m.lambda * m.w[t];
      exposure.set(id, exp);
      ratedMatches.set(id, (ratedMatches.get(id) ?? 0) + 1);
      const perGame = gamesPlayed.get(id) ?? new Map<string, number>();
      perGame.set(m.slug, (perGame.get(m.slug) ?? 0) + 1);
      gamesPlayed.set(id, perGame);
    }
  }

  const players: Record<string, PlayerSkillFit> = {};
  for (const id of playerIds) {
    const pi = playerIdx.get(id) as number;
    const exp = exposure.get(id) ?? SKILL_TRAIT_IDS.map(() => 0);
    const traits = {} as Record<SkillTraitId, PlayerTraitFit>;
    SKILL_TRAIT_IDS.forEach((trait, t) => {
      traits[trait] = { theta: x[pi * T + t], se: se[pi * T + t], exposure: exp[t] };
    });
    const games: Record<string, PlayerGameFit> = {};
    for (const [slug, count] of [...(gamesPlayed.get(id) ?? new Map())].sort((a, b) =>
      a[0] < b[0] ? -1 : 1,
    )) {
      const gi = gameIdx.get(`${id} ${slug}`);
      const offset = gi === undefined ? 0 : x[gi];
      const weights = skillProfileBySlug(slug);
      let rating = offset;
      if (weights !== undefined) {
        SKILL_TRAIT_IDS.forEach((trait, t) => {
          rating += (weights[trait] / 100) * x[pi * T + t];
        });
      }
      games[slug] = { rating, offset, matches: count };
    }
    const matchCount = ratedMatches.get(id) ?? 0;
    const distinctGames = gamesPlayed.get(id)?.size ?? 0;
    players[id] = {
      traits,
      games,
      ratedMatches: matchCount,
      distinctGames,
      eligible: matchCount >= config.minMatches && distinctGames >= config.minGames,
    };
  }

  const coopDifficulty: Record<string, number> = {};
  for (const slug of coopSlugs) coopDifficulty[slug] = x[coopIdx.get(slug) as number];

  return {
    players,
    coopDifficulty,
    skippedOffCatalog,
    skippedNoEvidence,
    newestPlayedAt,
    iterations,
    converged,
  };
}
