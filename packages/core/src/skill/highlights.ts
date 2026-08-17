// The highlight ladder: the best TRUE facts about a player, in priority
// order. Powers the hero cards on the stats page and the welcome card's
// headline. Every entry is a checkable statement derived from the fitted
// standings — nothing is fabricated, and an eligible player always gets at
// least the fallback (their own strongest axis exists by construction).

import { SKILL_TRAIT_IDS, type SkillTraitId } from "../protocol/http/skills.ts";
import { SKILL_CONFIG_V1, type SkillConfig } from "./config.ts";
import { type GameStanding, type TraitStandings, traitLeaderboard } from "./percentiles.ts";

export type SkillHighlight =
  | { kind: "trait-first"; trait: SkillTraitId }
  | { kind: "trait-top3"; trait: SkillTraitId; rank: number }
  | { kind: "game-first"; slug: string; matches: number }
  | { kind: "trait-strong"; trait: SkillTraitId; percentile: number; score: number }
  | { kind: "top-trait"; trait: SkillTraitId; percentile: number; score: number };

/**
 * All applicable highlights for `userId`, strongest claim first. Callers show
 * the head (welcome card) or the top few (hero cards). Empty only for
 * ineligible/unknown players.
 */
export function highlightsFor(
  userId: string,
  standings: TraitStandings,
  gameBoards: Record<string, GameStanding[]>,
  config: SkillConfig = SKILL_CONFIG_V1,
): SkillHighlight[] {
  const firsts: SkillHighlight[] = [];
  const top3s: SkillHighlight[] = [];
  const strongs: SkillHighlight[] = [];
  let best: { trait: SkillTraitId; percentile: number; score: number } | null = null;

  for (const trait of SKILL_TRAIT_IDS) {
    const board = traitLeaderboard(standings[trait], config);
    const boardRow = board?.find((s) => s.userId === userId);
    if (boardRow) {
      if (boardRow.rank === 1) firsts.push({ kind: "trait-first", trait });
      else if (boardRow.rank <= 3) top3s.push({ kind: "trait-top3", trait, rank: boardRow.rank });
    }
    const row = standings[trait].find((s) => s.userId === userId);
    if (row && !row.provisional) {
      if (row.percentile >= 60)
        strongs.push({ kind: "trait-strong", trait, percentile: row.percentile, score: row.score });
      if (best === null || row.percentile > best.percentile) {
        best = { trait, percentile: row.percentile, score: row.score };
      }
    }
  }

  const gameFirsts: SkillHighlight[] = [];
  for (const [slug, board] of Object.entries(gameBoards).sort(([a], [b]) => (a < b ? -1 : 1))) {
    const top = board[0];
    if (top?.userId === userId) gameFirsts.push({ kind: "game-first", slug, matches: top.matches });
  }

  // Sort within tiers so the most impressive claim leads deterministically.
  strongs.sort((a, b) =>
    a.kind === "trait-strong" && b.kind === "trait-strong" ? b.percentile - a.percentile : 0,
  );
  gameFirsts.sort((a, b) =>
    a.kind === "game-first" && b.kind === "game-first" ? b.matches - a.matches : 0,
  );

  const ladder: SkillHighlight[] = [...firsts, ...top3s, ...gameFirsts, ...strongs];
  // Fallback: even a below-average eligible player has a strongest axis.
  // Skip it when provisional-free axes are absent entirely.
  if (best !== null && ladder.length === 0) {
    ladder.push({
      kind: "top-trait",
      trait: best.trait,
      percentile: best.percentile,
      score: best.score,
    });
  }
  return ladder;
}
