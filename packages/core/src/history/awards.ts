// Per-game end-of-match AWARDS — table-voted bonuses that add points onto the
// winners' scores. A property of the *game*, keyed by slug like
// score-config.ts, so the record form, the match card, and any stats read one
// source of truth.
//
// Publish or Perish is the motivating case: after the defense speeches the
// table votes three awards, each worth bonus citations. Ties give every tied
// player the full bonus (rulebook), so the same award may sit on several
// players. The stored player `score` is always the FINAL total (base
// citations + award points) — everything downstream (placement, stats, the
// rating engine) keeps reading `score` unchanged; the per-player `awards`
// ids exist so forms can round-trip the base and cards can show the trophy.

export type MatchAward = {
  /** Stable id persisted on `players[].awards`. */
  id: string;
  label: string;
  points: number;
};

export const PUBLISH_OR_PERISH_SLUG = "publish-or-perish";

const AWARDS_BY_SLUG: Record<string, readonly MatchAward[]> = {
  [PUBLISH_OR_PERISH_SLUG]: [
    { id: "snarkiest-reviewer", label: "Snarkiest Reviewer", points: 3 },
    { id: "theoretical-innovation", label: "Theoretical Innovation", points: 3 },
    { id: "almost-there", label: "Almost There", points: 2.9 },
  ],
};

export function awardsForSlug(slug: string | null | undefined): readonly MatchAward[] {
  return (slug && AWARDS_BY_SLUG[slug]) || [];
}

/** Total bonus points of a player's award ids (unknown ids count zero). */
export function awardPoints(
  slug: string | null | undefined,
  awardIds: readonly string[] | undefined,
): number {
  if (!awardIds || awardIds.length === 0) return 0;
  const defs = awardsForSlug(slug);
  let total = 0;
  for (const id of awardIds) total += defs.find((a) => a.id === id)?.points ?? 0;
  return total;
}

export function awardLabel(slug: string | null | undefined, id: string): string {
  return awardsForSlug(slug).find((a) => a.id === id)?.label ?? id;
}
