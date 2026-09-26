/**
 * Rulings on points the rulebook leaves open. Each flag is read in exactly one
 * place (named beside it) so a table ruling can be flipped in one line.
 *
 * Fixed rulings that are not flags:
 *   - Turn order after Turn 1 is the rulebook's priority list — region
 *     (Forest, Plains, Mountains, Cemetery), then path (Road, Railroad, Boat),
 *     then closeness to the Labyrinth, then the top of a stack
 *     (`board.orderKey`). "Furthest from the Castle plays first" is its
 *     summary. The Labyrinth ranks as Forest.
 *   - "Older player first" on a Turn-1 Speed tie becomes the lower seat.
 *   - "One general direction" is a simple path: no space twice, so paths may
 *     change at an intersection but a Vampire never doubles back
 *     (`board.walkDestinations`).
 *   - Confuse walks a shortest route to the Labyrinth, lowest space id first
 *     on a fork (`board.confuseDestination`).
 *   - Hunt Track column N costs N Speed; a pile holding any Fast card costs
 *     +1 once (`rules.huntCost`). A Rose costs 0.
 *   - The pusher chooses where each pushed Vampire goes, from the spaces
 *     adjacent to the landing space, never into the Castle
 *     (`board.pushDestinations`).
 *   - Drawn cards (Vampire Strength, Vampiric Will, Draw token) go straight
 *     into the playing area, as the hand has already been played.
 *   - The Castle's Well counts for Spicy and Form of Mist.
 *
 * Missions (`scoring.ts`, `rules.instantActions`):
 *   - "Hunted" is every non-Starting card a Vampire owns, Digested ones
 *     included. Human tokens count as Humans of their type (majorities,
 *     sets, type counts) but have no printed VP and no keywords.
 *   - Majority and "fewer than each" Missions are strict, as are Rich Get
 *     Richer and Catch Up; "the score before Missions" is the night's VP +
 *     sunrise + End-of-Game card bonuses.
 *   - The Host beats a Vampire who came home later or not at all.
 *   - Missionary counts the scoring tiles in its own set (Public or yours),
 *     itself included.
 *   - Tipsy's tankard is the Confuse icon.
 *   - The "X" Humans (Veres, Nemes, Szalai, Eli) have printed VP 0: they
 *     never count for Meh, Three-Star Dinner, Haute Cuisine or Picky.
 *   - Instant free hunts take a whole Hunt Track space ("a card" = a card or
 *     pile), cost no Speed, use up no Hunt, and may chain into another
 *     Instant. Beast Master lifts one Familiar out of its pile; arriving
 *     after Speed was calculated, it adds its Speed to what is left.
 *   - Digestion must be the first thing done on your turn.
 *
 * Step 1: a discard/draw effect is optional when its card says "you may"
 *   (the Hunt-deck Vampiric Strength, every Vampiric Will) and mandatory when
 *   it just says "Draw" (Dee, the Starting Vampire Strength): step 1 cannot
 *   end while one of those can still resolve (`rules.mandatoryDraws`).
 *
 * Powers:
 *   - Hypnosis moves a single card (not a pile) onto the neighbouring pile —
 *     empty or not — one row up or down or one column left or right. It is
 *     not a discard/draw effect, so it may wait until after movement, but
 *     each Hypnosis works once per turn.
 *   - The double Vampiric Will's second discard/draw is optional and comes
 *     after the first; like any activated card it can no longer be discarded.
 *   - Rookie "A" markers are per copy: one of the two Hypnosis is an A card.
 *
 * Humans:
 *   - Confuse's "4 spaces away from the Castle" is the rulebook's "toward
 *     the Labyrinth" (`board.confuseDestination`).
 *   - A Spicy Human is Permanent until a turn ends on a Well, so a Nanny's
 *     victim may give one up; Wiggles may digest it too.
 *   - Zephania / Angus / Peter's Digest is optional and may take any card in
 *     the playing area or discard pile — itself included, as it has just
 *     gone to the discard pile.
 *
 * Familiars (`game-engine.applyFamiliar`, `rules.familiarActions`):
 *   - Chop's "if you do not move" is choosing to stay; a Confuse shove before
 *     Speed does not count as moving.
 *   - Kutya's column-1 Hunt comes after movement, and like every extra Hunt
 *     it needs Speed left — discard Kutya before your last Hunt.
 *   - Wiggles may digest any card in your playing area, not only a Human;
 *     used in step 1 it removes a card before it acts, like a discard.
 *   - Ursa's "before you play" is the first thing on your turn (the hand is
 *     already face up in the playing area).
 *   - The four Echo-template Familiars (Echo, Bo, Gray, Jahda) are the Wolves.
 *   - Nanny: VP per Nanny for every push. A pushed Vampire with one
 *     Permanent loses it without a choice; with several it chooses, taking
 *     the decision mid-turn (`rules.deciderOf`).
 *   - Lockjaw's VP is scored when Speed is calculated, once per turn.
 */
export const RULINGS = {
  /**
   * `rules.canUseSpace`: with positive Speed, the space you end on triggers
   * even if you did not move this turn. The rulebook denies it only at
   * Speed ≤ 0.
   */
  stayTriggersSpace: true,
  /**
   * `game-engine.afterHunt`: Speed is lost after your LAST Hunt, not the
   * first — otherwise an extra Hunt (Well, Stealth, +1 Hunt token) could only
   * ever target a free Rose.
   */
  speedKeptForExtraHunts: true,
  /** `board.walkDestinations` / game-engine: Form of Mist spends no Speed. */
  mistIsFree: true,
  /**
   * `game-engine.startTurn`: a Vampire in the Castle cannot move or hunt, so
   * its turn (cards cycled, end-of-turn Rose VP) resolves automatically.
   */
  castleTurnsAutoResolve: true,
  /** `game-engine.applyConfuse`: Confuse has no effect in the Castle. */
  castleIgnoresConfuse: true,
} as const;
