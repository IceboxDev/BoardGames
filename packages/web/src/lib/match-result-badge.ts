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
//     placement — 1st = "Won" (green), everyone else their ordinal ("2nd"/"3rd",
//     amber; actual last place in rose). A DUEL (field of 2) reads "Lost" —
//     "2nd of 2" would dress up a defeat. Point-less FFA (Villainous) has no
//     placement → Won/Lost.
//   - Scored co-op (Just One): the team score as `score / max` (e.g. "6 / 13"),
//     green at the game's max else amber.
//   - Last-standing: same placement treatment over the knockout/chip order.
//   - Everything else (teams, one-vs-many, binary co-op): Won/Lost (+ "Ran it"
//     for a non-competing moderator).

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

  // Drawn duel (chess / Connect 4) — a real competitive result in the neutral
  // gray the tournament table already uses for draws.
  if (outcome.draw) return { label: "Draw", tone: "neutral" };

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
  return placementBadge(placement, outcome.players.length, someoneBelow);
}

/**
 * Non-winner placement label: the ordinal, amber for the middle of the field
 * and rose for actual last place. A duel (field of 2) is a plain "Lost" —
 * "2nd of 2" would dress up a defeat.
 */
function placementBadge(place: number, total: number, someoneBelow: boolean): MatchResultBadge {
  if (total <= 2) return { label: "Lost", tone: "rose" };
  return { label: ordinal(place), tone: someoneBelow ? "amber" : "rose" };
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
      // The D&D DM mirrors the teams moderator: present, but not competing.
      if (outcome.moderator?.userId === userId) return { label: "Ran it", tone: "neutral" };
      if (!outcome.participants.some((p) => p.userId === userId)) return null;
      if (outcome.score !== undefined) {
        const max = coopMaxScoreForSlug(gameSlug);
        const perfect = max !== undefined && outcome.score >= max;
        // Show `score / max` (e.g. "6 / 13"), matching the match-history card.
        const label = max !== undefined ? `${outcome.score} / ${max}` : String(outcome.score);
        return { label, tone: perfect ? "emerald" : "amber" };
      }
      // No outcome and no score = a campaign session. The badge reflects the
      // session as it was RECORDED — nobody knew the campaign's fate that
      // night, so it reads "Ongoing" even after the story concludes. Stats are
      // the campaign-aware side (`campaignResult` groups sessions server-side).
      if (outcome.outcome === undefined) return { label: "Ongoing", tone: "sky" };
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
      if (me.eliminationOrder !== undefined) {
        // Knockout order IS a finishing order (Not Enough Mana, Exploding
        // Kittens, …): place below every survivor, above everyone knocked out
        // earlier — same placement treatment as score-based FFA, where only
        // the actual last place reads "Last" in red.
        const survivorCount = outcome.players.filter(
          (p) => p.eliminationOrder === undefined,
        ).length;
        const myOrder = me.eliminationOrder;
        // Eliminated LATER (higher order) = outlasted me = places above me.
        const outlastedMe = outcome.players.filter(
          (p) => p.eliminationOrder !== undefined && p.eliminationOrder > myOrder,
        ).length;
        const someoneBelow = outcome.players.some(
          (p) => p.eliminationOrder !== undefined && p.eliminationOrder < myOrder,
        );
        return placementBadge(
          survivorCount + outlastedMe + 1,
          outcome.players.length,
          someoneBelow,
        );
      }
      // Ranked survivors (poker chip standings): only the chip leader "Won";
      // the rest place. Unranked survivors keep the legacy co-winner badge.
      if (me.survivorRank === undefined) return { label: "Won", tone: "emerald" };
      const bestRank = Math.min(
        ...outcome.players.map((p) => p.survivorRank).filter((r): r is number => r !== undefined),
      );
      return me.survivorRank === bestRank
        ? { label: "Won", tone: "emerald" }
        : { label: ordinal(me.survivorRank), tone: "amber" };
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
