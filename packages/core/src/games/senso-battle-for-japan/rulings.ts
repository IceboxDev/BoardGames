/**
 * Rulings on points the rulebook leaves open. Each flag is read in exactly one
 * function (named beside it) so a table ruling can be flipped in one place.
 *
 * Fixed rulings that are not flags:
 *   - Gravity is universal: after ANY removal a region's cubes slide up, so
 *     "highest empty square" and "directly above" stay well defined
 *     (`board.removeCube`). The rulebook states it only for Aggression.
 *   - The First Player at setup is seat 0 (rulebook: random; rotation makes it
 *     irrelevant and seat 0 is the host).
 *   - The Emperor plays a normal hand and competes for tricks; it is special
 *     only in rewards (`as`) and scoring.
 */
export const RULINGS = {
  /** `rules.legalPlays`: a held Ninja may not be played while you hold the lead suit. */
  ninjaFollowsSuit: true,
  /** `rules.isOpponentCube`: cubes of clans without a seat can be swapped, struck and replaced. */
  neutralCubesAreOpponents: true,
  /** `scoring.scoreEmperor`: VP per empty-or-uncontrolled region (an empty region is not scored twice). */
  emperorVpPerRegion: 2,
  /** `rules.getLegalActions`: a `pass` is always offered during rewards. */
  rewardsOptional: true,
  /** `rules.getLegalActions`: a `pass` is always offered during the round-4 bonus. */
  bonusOptional: true,
  /** `board.returnCubeToSupply`: a struck / pushed-out cube goes back to its clan's supply. */
  removedCubesReturnToSupply: true,
  /** `rules.affectedRegionsOf`: only the destination of a move locks; the source stays open. */
  moveSourceIsAffected: false,
  /**
   * `scoring.resolveWinners`: literal rulebook — when a tie persists after the
   * cube count, "the Emperor is declared winner, whether the Emperor Faction
   * was playing or not": a seated Emperor wins even from outside the tie; with
   * no Emperor seat nobody does (draw). Set true to crown it only when tied.
   */
  emperorWinsTiesOnlyIfTied: false,
} as const;
