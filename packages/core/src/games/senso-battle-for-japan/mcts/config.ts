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
   * Robustness floor: each observed play's probability is mixed with uniform
   * (p' = (1 − floor)·p + floor / legal), so an opponent whose style the model
   * does not capture cannot zero out every plausible deal.
   */
  inferenceFloor: number;
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
  maxNodes: 1,
  cheat: false,
};

/** Tune the live defaults (tests and the bench use this to cap the budget). */
export function configureTenka(patch: Partial<TenkaConfig>): TenkaConfig {
  Object.assign(DEFAULT_TENKA, patch);
  return DEFAULT_TENKA;
}
