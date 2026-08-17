// Pure pickers behind the stats page's three hero cards. Every fact is a
// restatement of server-derived data — the only logic here is choosing which
// three true things lead, and formatting a 1–100 score.

import type {
  PlayerSkillResponse,
  ProfileMatchSummaryItem,
  SkillHighlightWire,
  SkillTraitId,
} from "@boardgames/core/protocol";
import { gamesByPlays, streaks } from "../insights/summary-stats.ts";

export type BestGameFact =
  | { kind: "ranked"; slug: string; rank: number; of: number; matches: number }
  | { kind: "most-played"; slug: string; title: string; plays: number };

/**
 * The player's best game: their highest leaderboard standing, ties broken by
 * more plays. Falls back to their most-played game when they hold no board
 * standing yet.
 */
export function bestGameFact(
  skill: PlayerSkillResponse,
  summaryItems: readonly ProfileMatchSummaryItem[] | undefined,
): BestGameFact | null {
  const ranked = [...skill.games].sort(
    (a, b) => a.rank - b.rank || b.matches - a.matches || a.slug.localeCompare(b.slug),
  )[0];
  if (ranked) return { kind: "ranked", ...ranked };
  const played = gamesByPlays(summaryItems ?? [])[0];
  return played ? { kind: "most-played", ...played } : null;
}

export type BestSkillFact = {
  trait: SkillTraitId;
  score: number;
  rank: number;
  of: number;
  provisional: boolean;
};

/** The player's strongest axis — confident axes first, then score, then rank. */
export function bestSkillFact(skill: PlayerSkillResponse): BestSkillFact | null {
  const traits = skill.traits ?? [];
  const pick = [...traits].sort((a, b) => {
    if (a.provisional !== b.provisional) return a.provisional ? 1 : -1;
    return b.score - a.score || a.rank - b.rank;
  })[0];
  if (!pick) return null;
  return {
    trait: pick.trait,
    score: pick.score,
    rank: pick.rank,
    of: pick.of,
    provisional: pick.provisional,
  };
}

export type ClaimFact =
  | { kind: "highlight"; highlight: SkillHighlightWire }
  | { kind: "streak"; length: number }
  | { kind: "winrate"; pct: number; wins: number; losses: number };

/**
 * The third card: the strongest claim that doesn't just repeat the other two
 * cards. Highlights about a *different* subject than the best-game/best-skill
 * cards lead; `top-trait` (a pure restatement of the best-skill card) never
 * shows. Falls back to a real win streak, then a win rate, then whatever
 * non-redundant highlight is left.
 */
export function claimFact(
  skill: PlayerSkillResponse,
  summaryItems: readonly ProfileMatchSummaryItem[] | undefined,
  bestGameSlug: string | null,
  bestSkillTrait: SkillTraitId | null = null,
): ClaimFact | null {
  const candidates = skill.highlights.filter(
    (h) => h.kind !== "top-trait" && !(h.kind === "game-first" && h.slug === bestGameSlug),
  );
  const fresh =
    candidates.find((h) => !("trait" in h) || h.trait !== bestSkillTrait) ?? candidates[0];
  if (fresh) return { kind: "highlight", highlight: fresh };

  if (summaryItems && summaryItems.length > 0) {
    const { bestWin } = streaks(summaryItems);
    if (bestWin >= 3) return { kind: "streak", length: bestWin };
    let wins = 0;
    let losses = 0;
    for (const item of summaryItems) {
      if (item.result === "win") wins++;
      else if (item.result === "loss") losses++;
    }
    if (wins + losses >= 5) {
      return { kind: "winrate", pct: Math.round((wins / (wins + losses)) * 100), wins, losses };
    }
  }

  return null;
}
