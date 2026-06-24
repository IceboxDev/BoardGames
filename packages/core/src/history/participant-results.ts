// Per-participant win/loss derivation for match outcomes.
//
// Match outcomes are stored as a discriminated union (see
// `protocol/http/history.ts`). Working out whether one specific player *won* a
// given match is non-trivial and differs per kind — and both the server (profile
// stats) and the web (match-list result badges) need the exact same answer.
// Centralising it here keeps the two from ever disagreeing.

import type { MatchOutcome, MatchOutcomeFreeForAll } from "../protocol/http/history.ts";
import { isPointlessFreeForAll, lowScoreWinsForSlug } from "./score-config.ts";

/**
 * One participant's disposition in a single match.
 *
 * - `"moderator"` is a non-competing slot (e.g. Blood on the Clocktower's
 *   Storyteller). It is neither a win nor a loss and is excluded from win-rate
 *   math, but the person was still *present*.
 * - `"played"` is a participant in a scored co-op with no win/loss (Just One):
 *   counts as a play, excluded from win-rate, and carries no Won/Lost badge.
 * - `null` means the user did not take part in this match at all.
 */
export type ParticipantResult = "win" | "loss" | "moderator" | "played" | null;

/**
 * Every distinct `userId` referenced by an outcome, across all five kinds.
 * Mirrors the server-only `collectUserIds` (match-history-validate.ts) but lives
 * in core so the web client can use it too — e.g. to confirm a profile owner
 * actually participated in a match returned by a `LIKE`-filtered query.
 */
export function extractParticipantIds(outcome: MatchOutcome): string[] {
  const ids = new Set<string>();
  switch (outcome.kind) {
    case "free-for-all":
    case "last-standing":
      for (const p of outcome.players) ids.add(p.userId);
      break;
    case "teams":
      for (const t of outcome.teams) for (const m of t.members) ids.add(m.userId);
      if (outcome.moderator) ids.add(outcome.moderator.userId);
      break;
    case "coop":
      for (const p of outcome.participants) ids.add(p.userId);
      break;
    case "one-vs-many":
      ids.add(outcome.solo.userId);
      for (const m of outcome.team.members) ids.add(m.userId);
      break;
  }
  return [...ids];
}

/** Whether `userId` took part in `outcome` in any slot (including moderator). */
export function participatedIn(outcome: MatchOutcome, userId: string): boolean {
  return extractParticipantIds(outcome).includes(userId);
}

/**
 * Resolve a single participant's win/loss disposition. The per-kind winner
 * rules:
 *
 * - **free-for-all** — explicit `rank` wins when any player carries one (covers
 *   point-less games like Villainous where the sole winner is `rank: 1` and
 *   every score is 0); otherwise the best `score` wins — **highest by default,
 *   lowest when `lowestWins` is set** (penalty games like Phase 10 / Bandit; the
 *   caller passes `lowScoreWinsForSlug(slug)`). Best rank / best score is shared
 *   by co-winners ("implicit co-winners", matching the write-path validator), so
 *   a tie at the top is a `"win"` for each.
 * - **teams** — win iff the player's team index is in `winnerTeamIndices`; the
 *   moderator slot returns `"moderator"`.
 * - **last-standing** — survivors (no `eliminationOrder`) win, the eliminated lose.
 * - **coop** — every participant shares the single win/loss `outcome`; a scored
 *   co-op with no `outcome` (Just One) is `"played"` for everyone.
 * - **one-vs-many** — the side named by `winnerSide` wins.
 *
 * Returns `null` if the user isn't in the match.
 */
export function deriveParticipantResult(
  outcome: MatchOutcome,
  userId: string,
  lowestWins = false,
): ParticipantResult {
  switch (outcome.kind) {
    case "free-for-all": {
      const me = outcome.players.find((p) => p.userId === userId);
      if (!me) return null;
      const ranked = outcome.players.filter((p) => p.rank !== undefined);
      if (ranked.length > 0) {
        if (me.rank === undefined) return "loss";
        const best = Math.min(...ranked.map((p) => p.rank as number));
        return me.rank === best ? "win" : "loss";
      }
      const scores = outcome.players.map((p) => p.score);
      const best = lowestWins ? Math.min(...scores) : Math.max(...scores);
      return me.score === best ? "win" : "loss";
    }
    case "teams": {
      if (outcome.moderator?.userId === userId) return "moderator";
      const teamIndex = outcome.teams.findIndex((t) => t.members.some((m) => m.userId === userId));
      if (teamIndex === -1) return null;
      return outcome.winnerTeamIndices.includes(teamIndex) ? "win" : "loss";
    }
    case "last-standing": {
      const me = outcome.players.find((p) => p.userId === userId);
      if (!me) return null;
      return me.eliminationOrder === undefined ? "win" : "loss";
    }
    case "coop": {
      if (!outcome.participants.some((p) => p.userId === userId)) return null;
      // Scored co-ops (Just One) have no win/loss — present, but excluded from
      // win-rate math.
      if (outcome.outcome === undefined) return "played";
      return outcome.outcome === "win" ? "win" : "loss";
    }
    case "one-vs-many": {
      if (outcome.solo.userId === userId) return outcome.winnerSide === "solo" ? "win" : "loss";
      if (!outcome.team.members.some((m) => m.userId === userId)) return null;
      return outcome.winnerSide === "team" ? "win" : "loss";
    }
  }
}

/**
 * A player's 1-based finishing position in a free-for-all (1 = winner) plus the
 * field size. `rank`-bearing games (a tie pinned to a strict 1..n order, or a
 * point-less `rank: 1` winner) use rank; otherwise position is by score in the
 * game's win direction (`lowestWins` for penalty games). Ties share a place
 * (two players on the best score are both 1st). Returns null if not present.
 */
export function freeForAllPlacement(
  outcome: MatchOutcomeFreeForAll,
  userId: string,
  lowestWins = false,
): { place: number; total: number } | null {
  const me = outcome.players.find((p) => p.userId === userId);
  if (!me) return null;
  const total = outcome.players.length;
  if (outcome.players.some((p) => p.rank !== undefined)) {
    const myRank = me.rank ?? total;
    const better = outcome.players.filter((p) => (p.rank ?? total) < myRank).length;
    return { place: better + 1, total };
  }
  const better = outcome.players.filter((p) =>
    lowestWins ? p.score < me.score : p.score > me.score,
  ).length;
  return { place: better + 1, total };
}

/**
 * "Scheme A" performance credit in [0,1] for one match, or null when the match
 * is non-competitive for this user (moderator, scored co-op, or not present) and
 * should be excluded from the performance average entirely.
 *
 * - win → 1
 * - free-for-all loss → linear placement credit `(N - place) / (N - 1)` (2nd of
 *   5 = 0.75, last = 0). Point-less free-for-alls have no placement, so a loss
 *   there is a flat 0.
 * - every other loss (teams, last-standing, binary co-op, one-vs-many) → 0
 *
 * `slug` selects the game's scoring direction / point-less-ness via the shared
 * score-config; pass the match's `gameSlug`.
 */
export function participantPerformanceCredit(
  outcome: MatchOutcome,
  userId: string,
  slug: string | null = null,
): number | null {
  const lowestWins = lowScoreWinsForSlug(slug);
  const result = deriveParticipantResult(outcome, userId, lowestWins);
  if (result === null || result === "moderator" || result === "played") return null;
  if (result === "win") return 1;
  // loss
  if (outcome.kind === "free-for-all" && !isPointlessFreeForAll(slug)) {
    const pl = freeForAllPlacement(outcome, userId, lowestWins);
    if (!pl || pl.total <= 1) return 0;
    return (pl.total - pl.place) / (pl.total - 1);
  }
  return 0;
}
