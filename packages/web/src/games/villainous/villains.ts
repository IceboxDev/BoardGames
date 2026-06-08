// Villainous editions and their villain rosters. Single source of truth shared
// by the match-variant edition picker (`match-variants.ts`) and the per-player
// villain selector (`VillainousForm`).
//
// Villainous is recorded as a point-less free-for-all: the sole winner is
// marked with `rank: 1`, every score stays 0, and each player's villain is
// stored in the free-for-all player's optional `role` field. The chosen edition
// is persisted in `outcome.scenario` (shown as the italic subtitle under the
// game in MatchCard, exactly like 7 Wonders expansions) and decides which
// villains are selectable.

export const VILLAINOUS_EDITIONS = {
  // The 4-villain streamlined starter box.
  "Introduction to Evil": ["Captain Hook", "Maleficent", "Prince John", "Ursula"],
  // The 6-villain base game; a superset of Introduction to Evil.
  "The Worst Takes It All": [
    "Captain Hook",
    "Jafar",
    "Maleficent",
    "Prince John",
    "Queen of Hearts",
    "Ursula",
  ],
} as const satisfies Record<string, readonly string[]>;

export type VillainousEdition = keyof typeof VILLAINOUS_EDITIONS;

export const VILLAINOUS_EDITION_LABELS = Object.keys(VILLAINOUS_EDITIONS) as VillainousEdition[];

function isEdition(value: string | undefined): value is VillainousEdition {
  return value !== undefined && value in VILLAINOUS_EDITIONS;
}

/**
 * Villains selectable for a stored edition string. Falls back to the full
 * 6-villain superset ("The Worst Takes It All") when no edition is picked yet,
 * so the form is usable before the admin taps an edition chip.
 */
export function villainsForEdition(edition: string | undefined): readonly string[] {
  return isEdition(edition)
    ? VILLAINOUS_EDITIONS[edition]
    : VILLAINOUS_EDITIONS["The Worst Takes It All"];
}
