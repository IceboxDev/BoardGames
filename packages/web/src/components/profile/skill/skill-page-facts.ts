// Pure pickers behind the stats page's three hero cards. Every fact is a
// restatement of server-derived data — the only logic here is choosing which
// three true things lead, and formatting a 1–100 score.

import type {
  PlayerSkillResponse,
  ProfileMatchSummaryItem,
  SkillHighlightWire,
  SkillTraitId,
} from "@boardgames/core/protocol";
import { coopMaxScoreForSlug } from "../../../games/score-config.ts";
import { gamesByPlays, recentForm, streaks } from "../insights/summary-stats.ts";

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
  | { kind: "winrate"; pct: number; wins: number; losses: number }
  | { kind: "coop-wins"; wins: number }
  | { kind: "coop-score"; title: string; score: number; max: number | null }
  | { kind: "form"; wins: number; window: number }
  | { kind: "variety"; games: number }
  | { kind: "dedication"; games: number };

/**
 * The third card: the strongest TRUE claim that doesn't just repeat the other
 * two cards — and NEVER a demoralizing one. Podium/strong highlights lead;
 * `top-trait` (a pure restatement of the best-skill card) never shows. Then a
 * ladder of ego-safe facts: win streak, a WINNING record (never a losing
 * one), co-op victories, a best team score, current form, breadth of games —
 * and, as the guaranteed floor, sheer dedication. Everyone eligible gets
 * something that feels good AND is checkable.
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

  const items = summaryItems ?? [];
  if (items.length === 0) return null;

  const { bestWin } = streaks(items);
  if (bestWin >= 3) return { kind: "streak", length: bestWin };

  let wins = 0;
  let losses = 0;
  let coopWins = 0;
  let bestCoop: { title: string; score: number; max: number | null } | null = null;
  for (const item of items) {
    if (item.result === "win") {
      wins++;
      if (item.kind === "coop") coopWins++;
    } else if (item.result === "loss") losses++;
    if (item.kind === "coop" && item.score !== null && item.gameSlug) {
      const max = coopMaxScoreForSlug(item.gameSlug) ?? null;
      const ratio = max ? item.score / max : 0;
      const bestRatio = bestCoop?.max ? bestCoop.score / bestCoop.max : 0;
      if (!bestCoop || ratio > bestRatio) {
        bestCoop = { title: item.gameTitle, score: item.score, max };
      }
    }
  }

  // A win RATE only ever brags — losing records stay off the podium.
  if (wins + losses >= 5 && wins / (wins + losses) >= 0.55) {
    return { kind: "winrate", pct: Math.round((wins / (wins + losses)) * 100), wins, losses };
  }
  if (coopWins >= 2) return { kind: "coop-wins", wins: coopWins };
  if (bestCoop && (!bestCoop.max || bestCoop.score / bestCoop.max >= 0.5)) {
    return { kind: "coop-score", ...bestCoop };
  }

  const form = recentForm(items, 10);
  const formWins = form.filter((r) => r === "win").length;
  if (form.length >= 6 && formWins >= Math.ceil(form.length / 2)) {
    return { kind: "form", wins: formWins, window: form.length };
  }

  const distinct = gamesByPlays(items).length;
  if (distinct >= 8) return { kind: "variety", games: distinct };

  // The floor: showing up is itself a claim, and it's always true.
  return { kind: "dedication", games: items.length };
}
