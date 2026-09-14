import type { LeafMode } from "./leaf-value";

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
   * gap (exact), the additive tier table, the exact simulation scored by the
   * learned predictor of the FINAL gap (learned; eval-weights.ts), or the tier
   * table with each cell corrected by the learned round-end net (vround;
   * vround-features.ts, falls back to tier where no net is trained).
   */
  leaf: LeafMode;
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
  /**
   * Softmax temperature for SAMPLING playout cards from the learned policy
   * (0 = argmax, with `epsilon` uniform noise on top). A stochastic honest
   * opponent model: the deal average then also averages over the modelled
   * reply distribution instead of one argmax line per deal.
   */
  playoutTemperature: number;
  /** Search the rewards phase by max^n (false = Shōgun's one-reward lookahead). */
  rewardsSearch: boolean;
  /** Rewards-phase max^n: max candidates per pick (iterative deepening up to this). */
  rewardWidth: number;
  /** Wall-clock budget for one reward decision. */
  rewardTimeMs: number;
  /**
   * VP-equivalent the rewards max^n credits per cube on the map (leaf and
   * candidate ranking). 0.02 = the engine's `evalPosition` tie-break; a
   * logistic fit of P(win) on 500 5p games (2026-09-13) weighed a cube edge
   * ~6× a point of score, i.e. cubes are future scoring the myopic objective
   * ignores. Measured as a knob; see NOTES in scratch/bench/kami.
   */
  rewardsCubeWeight: number;
  /**
   * Blend the board value net (vboard-features.ts, trained on final outcomes)
   * into the rewards max^n leaf: standing + λ · head(board). 0 = off; tables
   * without a trained net (vboard-models.ts) behave as 0.
   */
  rewardsBoardValue: number;
  /** Which head of the board net the blend uses: the predicted final gap (VP) or P(win). */
  rewardsBoardHead: "gap" | "win";
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
  /**
   * Replace the playout's judgement of the round with a learned one: after
   * `truncatePlies` plies of playout, the expected-tier net (vtrick-features.ts)
   * predicts each seat's final tier from the dealt world and the leaf becomes
   * Σ_p Σ_t P_p(t)·cell[s][p][t]. "none" = play every deal to the round end.
   * Tables without a trained net (vtrick-models.ts) behave as "none".
   */
  valueNet: "none" | "expected-tier";
  /** Playout plies before the value net is asked (0 = right after the root candidate). */
  truncatePlies: number;
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
  playoutTemperature: 0,
  rewardsSearch: false,
  rewardWidth: 6,
  rewardTimeMs: 150,
  rewardsCubeWeight: 0.02,
  rewardsBoardValue: 0,
  rewardsBoardHead: "gap",
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
  valueNet: "none",
  truncatePlies: 0,
  maxNodes: 1,
  cheat: false,
};

/** Tune the live defaults (tests and the bench use this to cap the budget). */
export function configureTenka(patch: Partial<TenkaConfig>): TenkaConfig {
  Object.assign(DEFAULT_TENKA, patch);
  return DEFAULT_TENKA;
}

/**
 * Kami = the rung above Tenka (plan "Kami", 2026-09-13/14): Tenka's card play
 * with the rewards phase searched by max^n over every seat's picks (width 8,
 * 300 ms) instead of Shōgun's one-reward lookahead. Both engines had played
 * the rewards phase with the same code until now, which is why no trick-phase
 * change ever moved 5p. Ship gates, mirrored pairs: 5p 55.0 % vs Shōgun
 * (paired +10.0 ± 6.4) and +7.8 ± 6.3 vs Tenka; 3p +17.8 vs Shōgun and
 * +6.0 vs Tenka; 2p 61.0 % vs Shōgun, 91.0 % vs Daimyō, +1.5 vs Tenka;
 * latency p95 200.6 ms. Everything else the plan tried on top was null or
 * worse against this baseline (learned tier cells +0.5 stacked, sampled
 * playouts, cube credit, the expected-tier net −4..−7, the board value net
 * unlearnable) — see scratch/bench/kami/NOTES.md. `configureTenka` does not
 * touch this object.
 */
export const DEFAULT_KAMI: TenkaConfig = {
  ...DEFAULT_TENKA,
  rewardsSearch: true,
  // Width/time sweep vs Tenka, 5p mirrored 800 games: width 4 +4.3, width 6 @150 ms
  // +7.8, width 8 @300 ms +12.8 ± 6.5 — the rewards phase rewards more search.
  rewardWidth: 8,
  rewardTimeMs: 300,
};

/** Tune Kami's live defaults (bench and tests). */
export function configureKami(patch: Partial<TenkaConfig>): TenkaConfig {
  Object.assign(DEFAULT_KAMI, patch);
  return DEFAULT_KAMI;
}
