// Outcome → evidence extraction: reduces every stored match outcome to a list
// of pairwise Bradley–Terry comparisons between two *sides* (sets of players,
// or the per-game co-op baseline opponent). This is the only place outcome
// kinds are interpreted by the rating engine; placement/winner semantics are
// delegated to the canonical helpers in `history/participant-results.ts` so
// the engine can never disagree with profile stats.

import { freeForAllPlacement, lastStandingPlacement } from "../history/participant-results.ts";
import { isPointlessFreeForAll, lowScoreWinsForSlug } from "../history/score-config.ts";
import type { MatchOutcome } from "../protocol/http/history.ts";

export type SkillComparison = {
  /** Side A member ids (a team shares its strength equally). */
  a: string[];
  /** Side B member ids, or null = this game's co-op baseline opponent. */
  b: string[] | null;
  /** Observed score for side A: 1 win, 0.5 draw/tie, 0 loss. */
  score: 0 | 0.5 | 1;
  /** Evidence weight — `2 / #sides`, so a match contributes ~O(sides) total. */
  weight: number;
};

export type MatchEvidence = {
  /** Competing participants — moderator slots excluded. */
  competitors: string[];
  comparisons: SkillComparison[];
};

/**
 * Pairwise comparisons over a full finishing order given each entity's place.
 * Equal places are genuine ties (0.5) — callers must only pass orders where
 * "same place" means "actually tied", not "order unrecorded".
 */
function pairwiseFromPlaces(
  entities: { members: string[]; place: number }[],
  weight: number,
): SkillComparison[] {
  const out: SkillComparison[] = [];
  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      const a = entities[i];
      const b = entities[j];
      const score = a.place === b.place ? 0.5 : a.place < b.place ? 1 : 0;
      out.push({ a: a.members, b: b.members, score, weight });
    }
  }
  return out;
}

/**
 * Extract the rating evidence a single match carries, or null when it carries
 * none (scored co-ops, unresolved co-ops, single-participant rows).
 */
export function matchEvidence(slug: string | null, outcome: MatchOutcome): MatchEvidence | null {
  switch (outcome.kind) {
    case "free-for-all": {
      const players = outcome.players;
      const n = players.length;
      if (n < 2) return null;
      const weight = 2 / n;
      const competitors = players.map((p) => p.userId);
      if (outcome.draw) {
        // Drawn duel (chess / Connect 4): every pair genuinely tied.
        const entities = players.map((p) => ({ members: [p.userId], place: 1 }));
        return { competitors, comparisons: pairwiseFromPlaces(entities, weight) };
      }
      const lowestWins = lowScoreWinsForSlug(slug);
      const placed = players.map((p) => ({
        members: [p.userId],
        place: freeForAllPlacement(outcome, p.userId, lowestWins)?.place ?? 1,
      }));
      // Point-less free-for-alls without a full explicit rank order only record
      // "who won" — the losers' relative order is unknown, so loser-vs-loser
      // pairs would fabricate tie evidence. Keep only winner-vs-rest pairs.
      const fullOrderKnown =
        !isPointlessFreeForAll(slug) || players.every((p) => p.rank !== undefined);
      const comparisons = fullOrderKnown
        ? pairwiseFromPlaces(placed, weight)
        : pairwiseFromPlaces(placed, weight).filter((c) => c.score !== 0.5);
      return { competitors, comparisons };
    }

    case "last-standing": {
      const players = outcome.players;
      if (players.length < 2) return null;
      const weight = 2 / players.length;
      // Knockout order IS a finishing order; unranked co-surviving winners
      // genuinely share the top spot.
      const placed = players.map((p) => ({
        members: [p.userId],
        place: lastStandingPlacement(outcome, p.userId)?.place ?? 1,
      }));
      return {
        competitors: players.map((p) => p.userId),
        comparisons: pairwiseFromPlaces(placed, weight),
      };
    }

    case "teams": {
      const sides = outcome.teams.map((t) => t.members.map((m) => m.userId));
      if (sides.length < 2) return null;
      const weight = 2 / sides.length;
      const competitors = sides.flat();
      const ranks = outcome.teams.map((t) => t.rank);
      if (ranks.every((r) => r !== undefined)) {
        const placed = sides.map((members, i) => ({ members, place: ranks[i] as number }));
        return { competitors, comparisons: pairwiseFromPlaces(placed, weight) };
      }
      // Only "these teams won" is recorded: winner-vs-loser pairs carry
      // information; winner-vs-winner and loser-vs-loser order is unknown.
      const winners = new Set(outcome.winnerTeamIndices);
      const comparisons: SkillComparison[] = [];
      for (let i = 0; i < sides.length; i++) {
        for (let j = i + 1; j < sides.length; j++) {
          if (winners.has(i) === winners.has(j)) continue;
          comparisons.push({
            a: sides[i],
            b: sides[j],
            score: winners.has(i) ? 1 : 0,
            weight,
          });
        }
      }
      return { competitors, comparisons };
    }

    case "one-vs-many": {
      const solo = [outcome.solo.userId];
      const team = outcome.team.members.map((m) => m.userId);
      if (team.length === 0) return null;
      return {
        competitors: [...solo, ...team],
        comparisons: [
          { a: solo, b: team, score: outcome.winnerSide === "solo" ? 1 : 0, weight: 1 },
        ],
      };
    }

    case "coop": {
      // Only resolved win/loss co-ops rate (callers promote a back-filled
      // `campaignResult` onto `outcome` before handing the unit to the engine).
      if (outcome.outcome === undefined) return null;
      const members = outcome.participants.map((p) => p.userId);
      if (members.length === 0) return null;
      return {
        competitors: members,
        comparisons: [{ a: members, b: null, score: outcome.outcome === "win" ? 1 : 0, weight: 1 }],
      };
    }
  }
}
