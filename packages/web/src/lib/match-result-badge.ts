import type { MatchOutcome, MatchOutcomeFreeForAll } from "@boardgames/core/protocol";
import type { BadgeTone } from "../components/ui/Badge.tsx";
import {
  coopMaxScoreForSlug,
  isPointlessFreeForAll,
  lowScoreWinsForSlug,
} from "../games/score-config.ts";

// One viewer's result in a match, as a colored badge for the profile match list.
// Game-aware, mirroring the read-side conventions in `MatchCard`:
//   - Score-based free-for-all (7 Wonders highest-wins, Bandit lowest-wins, …):
//     placement — 1st = "Won" (green), last = "Last" (red), middle = "2nd"/"3rd"
//     (amber). Point-less FFA (Villainous) has no placement → Won/Lost.
//   - Scored co-op (Just One): the team score as `score / max` (e.g. "6 / 13"),
//     green at the game's max else amber.
//   - Everything else (teams, last-standing, one-vs-many, binary co-op): Won/Lost
//     (+ "Ran it" for a non-competing moderator).

export type MatchResultBadge = { label: string; tone: BadgeTone };

type FreeForAllPlayer = MatchOutcomeFreeForAll["players"][number];

export function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

function freeForAllBadge(
  outcome: MatchOutcomeFreeForAll,
  userId: string,
  gameSlug: string | null,
): MatchResultBadge | null {
  const me = outcome.players.find((p) => p.userId === userId);
  if (!me) return null;

  // Point-less FFA: winner marked rank 1 (no scores) → Won/Lost only.
  if (isPointlessFreeForAll(gameSlug)) {
    const hasRank = outcome.players.some((p) => p.rank === 1);
    const topScore = Math.max(...outcome.players.map((p) => p.score));
    const won = hasRank ? me.rank === 1 : me.score === topScore;
    return won ? { label: "Won", tone: "emerald" } : { label: "Lost", tone: "rose" };
  }

  // Score-based placement (direction per game: Bandit/Phase 10 = lowest wins).
  // When players carry an explicit `rank` a tie was broken into a strict 1..n
  // order, so placement follows rank — otherwise two tied scores would both read
  // as "2nd" with nobody in "3rd".
  const rankMode = outcome.players.some((p) => p.rank !== undefined);
  const lowWins = lowScoreWinsForSlug(gameSlug);
  const better = rankMode
    ? (a: FreeForAllPlayer, b: FreeForAllPlayer) =>
        (a.rank ?? Number.POSITIVE_INFINITY) < (b.rank ?? Number.POSITIVE_INFINITY)
    : (a: FreeForAllPlayer, b: FreeForAllPlayer) =>
        lowWins ? a.score < b.score : a.score > b.score;
  const placement = 1 + outcome.players.filter((p) => better(p, me)).length;
  const someoneBelow = outcome.players.some((p) => better(me, p));

  if (placement === 1) return { label: "Won", tone: "emerald" };
  if (!someoneBelow) return { label: "Last", tone: "rose" };
  return { label: ordinal(placement), tone: "amber" };
}

export function matchResultBadge(
  outcome: MatchOutcome,
  userId: string,
  gameSlug: string | null,
): MatchResultBadge | null {
  switch (outcome.kind) {
    case "free-for-all":
      return freeForAllBadge(outcome, userId, gameSlug);
    case "coop": {
      if (!outcome.participants.some((p) => p.userId === userId)) return null;
      if (outcome.score !== undefined) {
        const max = coopMaxScoreForSlug(gameSlug);
        const perfect = max !== undefined && outcome.score >= max;
        // Show `score / max` (e.g. "6 / 13"), matching the match-history card.
        const label = max !== undefined ? `${outcome.score} / ${max}` : String(outcome.score);
        return { label, tone: perfect ? "emerald" : "amber" };
      }
      return outcome.outcome === "win"
        ? { label: "Won", tone: "emerald" }
        : { label: "Lost", tone: "rose" };
    }
    case "teams": {
      if (outcome.moderator?.userId === userId) return { label: "Ran it", tone: "neutral" };
      const teamIndex = outcome.teams.findIndex((t) => t.members.some((m) => m.userId === userId));
      if (teamIndex === -1) return null;
      return outcome.winnerTeamIndices.includes(teamIndex)
        ? { label: "Won", tone: "emerald" }
        : { label: "Lost", tone: "rose" };
    }
    case "last-standing": {
      const me = outcome.players.find((p) => p.userId === userId);
      if (!me) return null;
      return me.eliminationOrder === undefined
        ? { label: "Won", tone: "emerald" }
        : { label: "Lost", tone: "rose" };
    }
    case "one-vs-many": {
      if (outcome.solo.userId === userId) {
        return outcome.winnerSide === "solo"
          ? { label: "Won", tone: "emerald" }
          : { label: "Lost", tone: "rose" };
      }
      if (!outcome.team.members.some((m) => m.userId === userId)) return null;
      return outcome.winnerSide === "team"
        ? { label: "Won", tone: "emerald" }
        : { label: "Lost", tone: "rose" };
    }
  }
}
