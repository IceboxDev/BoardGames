import {
  MAX_ROUND_SCORES,
  MIN_ROUND_SCORES,
  resolveRound,
  roundScoreLeaders,
  roundWinCounts,
  roundWinLeaders,
  roundWinnerIndex,
  tiebreakForRound,
} from "@boardgames/core/history/round-scores";
import type { MatchOutcomeFreeForAll } from "@boardgames/core/history/types";

// Pure round-record helpers behind JaipurForm, extracted (like
// free-for-all-placement.ts) so the derivation is testable without the form.
// The seal math itself lives in core (`history/round-scores`) — this file owns
// only the FORM's normalization policy: how a partial edit state converges to
// a wire-valid record.

type Player = MatchOutcomeFreeForAll["players"][number];
type Tiebreak = NonNullable<MatchOutcomeFreeForAll["roundTiebreaks"]>[number];

/**
 * Converge the outcome to a consistent round record, INFERRING the round
 * count — a best-of-three has a third round exactly when rounds 1 and 2
 * split 1–1, so there is nothing for the recorder to pick:
 *
 * - the form starts at 2 rounds; round 3 materialises the moment the first
 *   two rounds settle on different winners, and an UNTOUCHED (all-zero)
 *   round 3 trims away again when they settle 2–0. A round 3 that already
 *   holds scores is never trimmed — a mid-edit pass through a 2–0 state must
 *   not destroy data (the save-time validator flags the impossible record
 *   instead);
 * - every player's rounds are padded/truncated to the inferred count and the
 *   summed totals recomputed;
 * - a tiebreak entry exists for exactly the rupee-tied rounds (zero token
 *   counts materialised so the form has fields, stale entries dropped,
 *   `goodsTokens` attached/stripped as the bonus tokens tie or stop tying);
 * - seal-based ranks: with every round settled and a sole seal leader, ranks
 *   are 1..n (leader first); otherwise ranks clear — the untouched all-zero
 *   state included, so a fresh form doesn't nag.
 */
export function normalizeJaipurOutcome(outcome: MatchOutcomeFreeForAll): MatchOutcomeFreeForAll {
  const storedRounds = Math.min(
    MAX_ROUND_SCORES,
    Math.max(
      MIN_ROUND_SCORES,
      outcome.players.reduce((max, p) => Math.max(max, p.roundScores?.length ?? 0), 0),
    ),
  );
  const normalized = normalizeAt(outcome, storedRounds);
  const target = inferredRoundCount(normalized);
  return target === storedRounds ? normalized : normalizeAt(normalized, target);
}

/** The round count the entered data implies — see normalizeJaipurOutcome. */
function inferredRoundCount(outcome: MatchOutcomeFreeForAll): number {
  const { players, roundTiebreaks } = outcome;
  const current = players[0]?.roundScores?.length ?? MIN_ROUND_SCORES;
  if (players.length === 0) return MIN_ROUND_SCORES;
  const first = roundWinnerIndex(players, 0, roundTiebreaks);
  const second = roundWinnerIndex(players, 1, roundTiebreaks);
  if (first === null || second === null) return current; // undecided — leave as-is
  if (first !== second) return MAX_ROUND_SCORES; // 1–1 → a third round happened
  const thirdUntouched = players.every((p) => (p.roundScores?.[2] ?? 0) === 0);
  return thirdUntouched ? MIN_ROUND_SCORES : current;
}

function normalizeAt(outcome: MatchOutcomeFreeForAll, rounds: number): MatchOutcomeFreeForAll {
  const players = outcome.players.map((p) => {
    const roundScores = (p.roundScores ?? []).slice(0, rounds);
    while (roundScores.length < rounds) roundScores.push(0);
    return { ...p, roundScores, score: roundScores.reduce((a, b) => a + b, 0) };
  });

  const prevTiebreaks = outcome.roundTiebreaks ?? [];
  const roundTiebreaks: Tiebreak[] = [];
  for (let r = 0; r < rounds; r++) {
    const leaders = roundScoreLeaders(players, r);
    const top = players[leaders[0] ?? 0]?.roundScores[r] ?? 0;
    if (leaders.length < 2 || top <= 0) continue; // not a real tie — no entry
    const prev = tiebreakForRound(prevTiebreaks, r);
    const bonusTokens = players.map((_, i) => prev?.bonusTokens[i] ?? 0);
    const entry: Tiebreak = { round: r, bonusTokens };
    // Goods tokens exist exactly while the bonus tokens still tie.
    if (resolveRound(players, r, entry).winner === null) {
      entry.goodsTokens = players.map((_, i) => prev?.goodsTokens?.[i] ?? 0);
    }
    roundTiebreaks.push(entry);
  }

  const { roundTiebreaks: _drop, ...base } = outcome;
  const next: MatchOutcomeFreeForAll = {
    ...base,
    players,
    ...(roundTiebreaks.length > 0 ? { roundTiebreaks } : {}),
  };

  const untouched =
    players.length === 0 || players.every((p) => p.roundScores.every((s) => s === 0));
  const settled =
    !untouched &&
    players[0].roundScores.every(
      (_, r) => resolveRound(players, r, tiebreakForRound(roundTiebreaks, r)).winner !== null,
    );
  const leaders = settled ? roundWinLeaders(players, roundTiebreaks) : [];
  if (leaders.length !== 1) {
    next.players = players.map((p) => ({ ...p, rank: undefined }));
    return next;
  }
  const wins = roundWinCounts(players, roundTiebreaks);
  const winnerIdx = leaders[0];
  const rest = players
    .map((_, i) => i)
    .filter((i) => i !== winnerIdx)
    .sort((a, b) => wins[b] - wins[a]);
  const rankByIdx = new Map<number, number>([
    [winnerIdx, 1],
    ...rest.map((idx, j) => [idx, j + 2] as const),
  ]);
  next.players = players.map((p, i) => ({ ...p, rank: rankByIdx.get(i) }));
  return next;
}

/** Whether two outcomes carry the same rounds/totals/ranks/tiebreaks. */
export function jaipurOutcomesEqual(a: MatchOutcomeFreeForAll, b: MatchOutcomeFreeForAll): boolean {
  if (!playersEqual(a.players, b.players)) return false;
  const at = a.roundTiebreaks ?? [];
  const bt = b.roundTiebreaks ?? [];
  if (at.length !== bt.length) return false;
  return at.every((t, i) => {
    const u = bt[i];
    return (
      t.round === u.round &&
      numbersEqual(t.bonusTokens, u.bonusTokens) &&
      (t.goodsTokens === undefined) === (u.goodsTokens === undefined) &&
      numbersEqual(t.goodsTokens ?? [], u.goodsTokens ?? [])
    );
  });
}

function playersEqual(a: readonly Player[], b: readonly Player[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((p, i) => {
    const q = b[i];
    return (
      p.userId === q.userId &&
      p.score === q.score &&
      p.rank === q.rank &&
      numbersEqual(p.roundScores ?? [], q.roundScores ?? [])
    );
  });
}

function numbersEqual(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((n, i) => n === b[i]);
}
