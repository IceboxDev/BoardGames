// Rating-engine configuration. One frozen, versioned object — the fitted
// ratings are a pure function of (match history, catalog weights, config), so
// any change here MUST bump `version`, which invalidates the server's stored
// fingerprint and triggers a full recompute.

export type SkillConfig = {
  /** Bump on ANY change to the constants below or to the model itself. */
  version: number;
  /** L2 prior strength on player trait ratings θ (per parameter, κ·θ²). */
  kTheta: number;
  /**
   * L2 prior on per-(player, game) offsets g — deliberately looser than
   * `kTheta` so single-game dominance is absorbed as game-specific skill
   * rather than trait evidence (the anti-farming property).
   */
  kGame: number;
  /** L2 prior on per-co-op-game difficulty d. */
  kCoop: number;
  /** Evidence half-life. Age is relative to the NEWEST match, not wall clock. */
  halfLifeDays: number;
  /** Profile eligibility: minimum rated match-units. */
  minMatches: number;
  /** Profile eligibility: minimum distinct games among rated units. */
  minGames: number;
  /** Per-axis exposure (Σ λ·w_t) below which an axis is provisional. */
  minExposure: number;
  /** A trait leaderboard renders only with this many exposure-cleared players. */
  minLeaderboardPlayers: number;
  /** A per-game leaderboard renders only with this many rated plays of it. */
  minGameBoardPlays: number;
  /**
   * Hardcoded θ that maps to a display score of 0. Deliberately a little
   * BELOW the lowest trait rating ever observed on prod (−0.215 at
   * 2026-08-17), so the weakest member still scores visibly above zero and a
   * player falling further never rescales the whole spectrum. The TOP of the
   * scale is dynamic — the group's current best trait rating maps to 100.
   */
  scoreFloorTheta: number;
  /** Newton convergence: stop when max|∇| drops below this. */
  tol: number;
  /** Newton iteration cap (backstop; typical convergence is <20). */
  maxIter: number;
};

export const SKILL_CONFIG_V1: SkillConfig = Object.freeze({
  version: 4,
  scoreFloorTheta: -0.35,
  kTheta: 1.0,
  kGame: 0.25,
  kCoop: 0.5,
  halfLifeDays: 730,
  minMatches: 8,
  minGames: 3,
  minExposure: 1.5,
  minLeaderboardPlayers: 5,
  minGameBoardPlays: 5,
  tol: 1e-8,
  maxIter: 100,
});
