// Best-of-three round records for scored free-for-alls — Jaipur is the
// motivating case: each round banks rupees, the round's high score takes its
// Seal of Excellence, and most seals wins the MATCH — which is why the winner
// can hold a lower rupee total than the loser (win rounds 1+3 narrowly, lose
// round 2 big). The record therefore carries per-player `roundScores`
// alongside the summed `score`, and the crowned winner (`rank: 1`) must hold
// the most round wins.
//
// A rupee-tied round is settled exactly as the rulebook says: the player with
// the most BONUS tokens takes the seal; still tied, the most GOODS tokens.
// Those counts are recorded per tied round in `roundTiebreaks`, and the seal
// is DERIVED from them — never free-picked.
//
// Shared between the web form, the client-side outcome validation, the core
// wire-schema superRefine, and the server's outcome allowlist, so all four
// agree on what a legal round record is. Highest-score-wins per round —
// penalty-direction games would need a direction flag before adopting this.

export const MIN_ROUND_SCORES = 2;
export const MAX_ROUND_SCORES = 3;

export interface RoundScoredPlayer {
  score: number;
  rank?: number;
  roundScores?: readonly number[];
}

/**
 * One rupee-tied round's rulebook tiebreaker. `round` is the 0-based index
 * into `roundScores`; the token arrays are index-aligned with the outcome's
 * `players` (only the rupee-tied leaders' entries matter). `goodsTokens` is
 * present exactly when the bonus tokens tie too.
 */
export interface RoundTiebreak {
  round: number;
  bonusTokens: readonly number[];
  goodsTokens?: readonly number[];
}

/** How one round's seal fell — or what's still missing to decide it. */
export type RoundResolution =
  | { winner: number; by: "rupees" | "bonus" | "goods" }
  | { winner: null; needs: "scores" | "bonus" | "goods" | "unbreakable" };

/** Indices of the players sharing the round's top rupee score. */
export function roundScoreLeaders(players: readonly RoundScoredPlayer[], round: number): number[] {
  const scores = players.map((p) => p.roundScores?.[round] ?? Number.NEGATIVE_INFINITY);
  const top = Math.max(...scores);
  return scores.reduce<number[]>((acc, s, i) => (s === top ? [...acc, i] : acc), []);
}

/** The tiebreak entry recorded for `round`, if any. */
export function tiebreakForRound(
  tiebreaks: readonly RoundTiebreak[] | undefined,
  round: number,
): RoundTiebreak | undefined {
  return tiebreaks?.find((t) => t.round === round);
}

/**
 * Settle one round: the sole rupee leader takes the seal; a tied round walks
 * the rulebook's ladder through the recorded tiebreak — most bonus tokens,
 * then most goods tokens. A round nobody scored in (`needs: "scores"`) or a
 * tie the record can't break yet stays unresolved.
 */
export function resolveRound(
  players: readonly RoundScoredPlayer[],
  round: number,
  tiebreak?: RoundTiebreak,
): RoundResolution {
  const leaders = roundScoreLeaders(players, round);
  if (leaders.length === 1) return { winner: leaders[0], by: "rupees" };
  const top = players[leaders[0] ?? 0]?.roundScores?.[round] ?? 0;
  if (leaders.length === 0 || top <= 0) return { winner: null, needs: "scores" };
  if (!tiebreak) return { winner: null, needs: "bonus" };
  const bonusTop = Math.max(...leaders.map((i) => tiebreak.bonusTokens[i] ?? 0));
  const bonusLeaders = leaders.filter((i) => (tiebreak.bonusTokens[i] ?? 0) === bonusTop);
  if (bonusLeaders.length === 1) return { winner: bonusLeaders[0], by: "bonus" };
  const goods = tiebreak.goodsTokens;
  if (!goods) return { winner: null, needs: "goods" };
  const goodsTop = Math.max(...bonusLeaders.map((i) => goods[i] ?? 0));
  const goodsLeaders = bonusLeaders.filter((i) => (goods[i] ?? 0) === goodsTop);
  if (goodsLeaders.length === 1) return { winner: goodsLeaders[0], by: "goods" };
  return { winner: null, needs: "unbreakable" };
}

/** The player index a round's seal went to, or null while it's unresolved. */
export function roundWinnerIndex(
  players: readonly RoundScoredPlayer[],
  round: number,
  tiebreaks?: readonly RoundTiebreak[],
): number | null {
  return resolveRound(players, round, tiebreakForRound(tiebreaks, round)).winner;
}

/**
 * Round wins ("seals") per player, index-aligned with `players`. Unresolved
 * rounds (missing rupees, or a tie the tiebreaks don't break yet) award
 * nobody.
 */
export function roundWinCounts(
  players: readonly RoundScoredPlayer[],
  tiebreaks?: readonly RoundTiebreak[],
): number[] {
  const rounds = players[0]?.roundScores?.length ?? 0;
  const wins = players.map(() => 0);
  for (let r = 0; r < rounds; r++) {
    const winner = roundWinnerIndex(players, r, tiebreaks);
    if (winner !== null) wins[winner] += 1;
  }
  return wins;
}

/** Indices of the players holding the most round wins (several on a tie). */
export function roundWinLeaders(
  players: readonly RoundScoredPlayer[],
  tiebreaks?: readonly RoundTiebreak[],
): number[] {
  const wins = roundWinCounts(players, tiebreaks);
  const best = Math.max(...wins);
  return wins.reduce<number[]>((acc, w, i) => (w === best ? [...acc, i] : acc), []);
}

/**
 * Full consistency check for a free-for-all outcome carrying round scores.
 * Returns a human-readable problem, or null when the record is coherent (or
 * carries no round scores at all). Invariants: every player has the same
 * 2–3 rounds and a positive round total somewhere in each round, each `score`
 * is the sum of that player's rounds, every rupee-tied round is settled by
 * its recorded tiebreak (bonus tokens, then goods tokens), one player holds
 * the most seals, every player is placed (`rank` 1..n), and rank 1 is the
 * seal leader.
 */
export function describeRoundScoresError(outcome: {
  players: readonly RoundScoredPlayer[];
  draw?: true;
  roundTiebreaks?: readonly RoundTiebreak[];
}): string | null {
  const players = outcome.players;
  const withRounds = players.filter((p) => p.roundScores !== undefined);
  if (withRounds.length === 0) {
    return outcome.roundTiebreaks !== undefined && outcome.roundTiebreaks.length > 0
      ? "a round tiebreak needs round scores recorded"
      : null;
  }
  if (withRounds.length !== players.length) {
    return "every player needs their round scores recorded";
  }
  const rounds = players[0].roundScores?.length ?? 0;
  if (rounds < MIN_ROUND_SCORES || rounds > MAX_ROUND_SCORES) {
    return `a best-of-three match records ${MIN_ROUND_SCORES}–${MAX_ROUND_SCORES} rounds`;
  }
  if (players.some((p) => p.roundScores?.length !== rounds)) {
    return "every player must have the same number of rounds";
  }
  if (outcome.draw) return "a best-of-three match cannot be a draw";
  for (const p of players) {
    const sum = (p.roundScores as readonly number[]).reduce((a, b) => a + b, 0);
    if (p.score !== sum) return "each total must equal the sum of that player's round scores";
  }

  // Tiebreak records: structurally sound, one per round, only on rounds whose
  // rupees actually tie, token arrays aligned with the players.
  const tiebreaks = outcome.roundTiebreaks ?? [];
  const seen = new Set<number>();
  for (const tb of tiebreaks) {
    const n = tb.round + 1;
    if (!Number.isInteger(tb.round) || tb.round < 0 || tb.round >= rounds) {
      return "a tiebreak references a round that isn't recorded";
    }
    if (seen.has(tb.round)) return `round ${n} has more than one tiebreak`;
    seen.add(tb.round);
    if (tb.bonusTokens.length !== players.length) {
      return `round ${n}'s bonus tokens must cover every player`;
    }
    if (tb.goodsTokens !== undefined && tb.goodsTokens.length !== players.length) {
      return `round ${n}'s goods tokens must cover every player`;
    }
    if (roundScoreLeaders(players, tb.round).length === 1) {
      return `round ${n} isn't tied — remove its tiebreak`;
    }
  }

  // Every round must settle on a seal holder.
  for (let r = 0; r < rounds; r++) {
    const tb = tiebreakForRound(tiebreaks, r);
    const res = resolveRound(players, r, tb);
    const n = r + 1;
    if (res.winner === null) {
      switch (res.needs) {
        case "scores":
          return `round ${n} has no rupees recorded`;
        case "bonus":
          return `round ${n} is tied — record its bonus tokens`;
        case "goods":
          return `round ${n}'s bonus tokens are tied — record its goods tokens`;
        case "unbreakable":
          return `round ${n} is still tied — check its bonus and goods token counts`;
      }
    }
    if (res.by === "bonus" && tb?.goodsTokens !== undefined) {
      return `round ${n}'s bonus tokens already decide it — remove its goods tokens`;
    }
  }

  const leaders = roundWinLeaders(players, tiebreaks);
  if (leaders.length !== 1) return "the seals are split — record the deciding round";

  if (players.some((p) => p.rank === undefined)) {
    return "a round-scored match needs every player placed";
  }
  const ranks = [...players.map((p) => p.rank as number)].sort((a, b) => a - b);
  if (ranks.some((r, i) => r !== i + 1)) {
    return "placements must rank every player 1..n";
  }
  if (players.findIndex((p) => p.rank === 1) !== leaders[0]) {
    return "the winner doesn't match the recorded round scores";
  }
  return null;
}
