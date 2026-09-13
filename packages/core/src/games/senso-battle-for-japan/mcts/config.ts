export interface TenkaConfig {
  /** Wall-clock budget per card decision; 0 = run exactly `iterations` (deterministic). */
  timeMs: number;
  /** Iteration cap (always applies). */
  iterations: number;
  /** UCT exploration constant, applied to values divided by `valueScale`. */
  c: number;
  /** Typical |Δ standing| within a round, in VP — normalises values for UCT. */
  valueScale: number;
  /**
   * Solve the round exactly once this many plies remain inside a playout.
   * Measured 2026-09-07 (2p, 100 ms, vs Shōgun): 6 plies cost ~3 points and
   * perfect-information playouts ~5 — a determinized world "knows" the hidden
   * cards, and play that exploits them misjudges the real table. Re-measured
   * the same day on the corrected solver (undo fix + canonical keys) with
   * compute free (iteration-capped, 7000 playouts): control 60.5 %, 4 plies
   * 59.0 %, 8 plies 56.3 %. 0 = off.
   */
  solvePlies: number;
  /**
   * At the root, skip the tree and solve each determinization exactly when the
   * round is this short. Measured 2026-09-07: 8 plies cost 2–3 points versus
   * sampled playouts (same double-dummy flaw as `solvePlies`). With compute
   * free on the corrected solver, 12 plies with 500 or 2000 deals scored
   * 50.5 % against the 60.5 % control — a double-dummy tablebase cannot help
   * this game's win rate. 0 = never.
   */
  rootSolvePlies: number;
  /** Determinizations in the root exact mode. */
  rootSolveDets: number;
  /**
   * Leaf valuation: simulate the rewards phase greedily and score the current
   * gap (exact), the additive tier table, or the exact simulation scored by the
   * learned predictor of the FINAL gap (learned; eval-weights.ts).
   */
  leaf: "exact" | "tier" | "learned";
  /** Collapse indistinguishable opponent cards into one child. */
  opponentBuckets: boolean;
  /**
   * Visit every root candidate on each sampled deal (paired comparison, PIMC
   * style) instead of one UCT descent per deal; the final pick is then the
   * best mean rather than the most visited child.
   */
  rootPaired: boolean;
  /** Playout policy judges "safe" winners by public information only (Daimyō's rule) instead of the dealt hands. */
  playoutHonest: boolean;
  /** Playout policy: Daimyō's rules or the linear policy fitted on the search's own play (policy-weights.ts). */
  playout: "daimyo" | "learned";
  /** Expand the Daimyō move first at every node. */
  heuristicFirst: boolean;
  /** Probability of a random legal card in playouts. */
  epsilon: number;
  /** Search the rewards phase by max^n (false = Shōgun's one-reward lookahead). */
  rewardsSearch: boolean;
  /** Rewards-phase max^n: max candidates per pick (iterative deepening up to this). */
  rewardWidth: number;
  /** Wall-clock budget for one reward decision. */
  rewardTimeMs: number;
  /**
   * Weight sampled deals by the likelihood of the opponents' plays so far under
   * the learned policy at this softmax temperature (0 = off). Paired root only.
   */
  inference: number;
  /**
   * Multiply the inference temperature by the number of opponents, so the
   * product of their play likelihoods stays as sharp as one opponent's would
   * be (a no-op with two players).
   */
  inferencePerOpponent: boolean;
  /**
   * Which voids each replayed opponent decision sees when its likelihood is
   * scored: "revealed" = the voids public at that moment (what the nets were
   * fitted on); "root" = the root's final mask at every decision (the
   * behaviour until 2026-09-13, kept for A/B runs). Measured "root" vs
   * "revealed" (200 ms): 5p 44.2/55.8, 2p 47.8/50.0, 3p 44.5/45.0 — the
   * faithful replay is never worse.
   */
  inferenceVoids: "revealed" | "root";
  /**
   * Robustness floor: each observed play's probability is mixed with uniform
   * (p' = (1 − floor)·p + floor / legal), so an opponent whose style the model
   * does not capture cannot zero out every plausible deal.
   */
  inferenceFloor: number;
  /**
   * How the paired root obtains its deals. "weighted": uniform deals weighted
   * by the play likelihood (self-normalised importance sampling). "mcmc": the
   * posterior deal sampler (deal-sampler.ts) — a Metropolis chain over
   * consistent deals whose unweighted samples already follow the likelihood,
   * so the weights cannot collapse onto a handful of deals when several
   * opponents' plays multiply. Both use `inference`/`inferenceFloor`.
   *
   * Measured 2026-09-13 (diag-ess.ts, 200 ms): at the live likelihood the
   * weighted estimator does NOT collapse — median ESS 981/1543 deals at 2p,
   * 522/1186 at 3p, 365/990 at 5p (p10 ≥ 134 everywhere) — so the chain
   * changes nothing there (vs weighted: 3p 46.0/45.0, 5p 52.5/47.5 then
   * 45.4/54.6, 2p 49.0/48.3). It only pays where the likelihood is sharp
   * enough to degenerate the weights (τ 1, floor 0.02: 5p median ESS 74,
   * p10 14): there it recovers ~8 of the 13–15 points such a likelihood costs
   * the weighted estimator (3p 44.0 vs weighted 39.5; 5p 46.7 vs 42.5) —
   * but that sharpness is itself a net loss at 3p/5p with the current
   * opponent nets, so the default stays "weighted". Seeding costs ~6 ms
   * (p90 13 ms) at 5p and the deal count drops ≤ 20 %; acceptance ≈ 0.7.
   */
  sampler: "weighted" | "mcmc";
  /** Use the "mcmc" sampler only at tables with at least this many seats. */
  samplerMinPlayers: number;
  /** Posterior sampler: independent chains, emitted round-robin. */
  mcmcChains: number;
  /** Posterior sampler: proposals per chain before the first emission. */
  mcmcBurnIn: number;
  /** Posterior sampler: proposals between two emissions of one chain. */
  mcmcThin: number;
  /** Posterior sampler: longest card rotation proposed (2 = swaps only). */
  mcmcCycleMax: number;
  /** Posterior sampler: probability of proposing a swap rather than a longer rotation. */
  mcmcPairProb: number;
  /** Posterior sampler: greedy deals scored and resampled into the chains' starting points. */
  mcmcSeedDraws: number;
  /**
   * Playout net: the shared one or the per-table refit where one exists
   * (policy-models.ts). The 3p/5p refits (32 hidden units, Shōgun self-play
   * at that table size) predict Shōgun's card better on fresh games — 3p
   * 63.0 → 64.8 % top-1, 5p 67.7 → 69.3 % — but measured no strength gain
   * (2026-09-13, vs the shared net: 3p 44.0/43.5, 5p 51.7/48.3).
   */
  playoutModel: "shared" | "per-table";
  /**
   * Opponent (deal-likelihood) net: the shared or per-table population net, or
   * "playout" = the playout net itself (Shōgun-distilled; sharper on Shōgun's
   * play, blind to other styles) — policy-models.ts. Measured 2026-09-13 vs
   * the shared net: per-table population 3p 45.5/46.5, 5p 44.6/55.4 (the 5p
   * refit leans on the Daimyō/Warlord rows and predicts Shōgun worse);
   * "playout" per-table 3p 49.0/41.5 then 46.0/47.5, 5p 47.5/52.5 — nothing
   * that survives replication.
   */
  opponentModel: "shared" | "per-table" | "playout";
  /**
   * Root tie-break: a candidate's mean value is reduced by this much per unit
   * of card strength, so a cheaper card wins a near-tie and strength stays in
   * hand. Shōgun subtracts 1e-4 per unit from a SUM over 24 deals, i.e. ~4e-6
   * per unit on the mean; 1e-4 on the mean (the value used until 2026-09-13)
   * overrode the ±0.001-per-trick leaf tie-break that decides most 5p
   * comparisons.
   */
  strengthTiebreak: number;
  /** Tree node cap per decision. */
  maxNodes: number;
  /**
   * BENCH ONLY — search the true hands instead of sampled ones. Measures how
   * much of the remaining edge is hidden information versus playout quality.
   * Never enable for live play.
   */
  cheat: boolean;
}

/**
 * Live defaults = the configuration that won the 2026-09-07 ladder (see the
 * project memory / scratch/bench): paired PIMC at the root (`maxNodes 1` — the
 * tree, the exact endgame and the rewards max^n all measured ≤ 0), playouts by
 * the net distilled from Shōgun's play with ε-noise, deals weighted by the
 * population opponent model, and the same 200 ms at every table size (more
 * time never measured stronger).
 */
export const DEFAULT_TENKA: TenkaConfig = {
  timeMs: 200,
  iterations: 50_000,
  c: 0.8,
  valueScale: 6,
  solvePlies: 0,
  rootSolvePlies: 0,
  rootSolveDets: 24,
  leaf: "tier",
  opponentBuckets: true,
  rootPaired: true,
  playoutHonest: true,
  playout: "learned",
  heuristicFirst: true,
  epsilon: 0.3,
  rewardsSearch: false,
  rewardWidth: 6,
  rewardTimeMs: 150,
  inference: 3,
  inferencePerOpponent: false,
  inferenceFloor: 0.1,
  inferenceVoids: "revealed",
  sampler: "weighted",
  samplerMinPlayers: 3,
  mcmcChains: 4,
  mcmcBurnIn: 48,
  mcmcThin: 4,
  mcmcCycleMax: 5,
  mcmcPairProb: 0.7,
  mcmcSeedDraws: 32,
  playoutModel: "shared",
  opponentModel: "shared",
  strengthTiebreak: 1e-4,
  maxNodes: 1,
  cheat: false,
};

/** Tune the live defaults (tests and the bench use this to cap the budget). */
export function configureTenka(patch: Partial<TenkaConfig>): TenkaConfig {
  Object.assign(DEFAULT_TENKA, patch);
  return DEFAULT_TENKA;
}
