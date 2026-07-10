// The Villainous boxes and their villain rosters. Single source of truth shared
// by the per-player villain selector (`VillainousForm`) and history rendering.
//
// Villainous ships as two separate BOXES, and they are two separate catalog
// games — not one game with an "edition" variant. They seat different party
// sizes (Introduction to Evil 2-4, The Worst Takes it All 2-6), so which box a
// player owns decides whether a night's group fits. Ownership is therefore
// per-box, exactly like the Codenames family.
//
// Villainous is recorded as a point-less free-for-all: the sole winner is
// marked with `rank: 1`, every score stays 0, and each player's villain is
// stored in the free-for-all player's optional `role` field.

/** The 6-villain base box (2-6 players). Its roster is a superset of the starter's. */
export const VILLAINOUS_BASE_SLUG = "villainous";
/** The 4-villain streamlined starter box (2-4 players). */
export const VILLAINOUS_INTRO_SLUG = "villainous-introduction-to-evil";

export const VILLAINOUS_ROSTERS = {
  [VILLAINOUS_INTRO_SLUG]: ["Captain Hook", "Maleficent", "Prince John", "Ursula"],
  [VILLAINOUS_BASE_SLUG]: [
    "Captain Hook",
    "Jafar",
    "Maleficent",
    "Prince John",
    "Queen of Hearts",
    "Ursula",
  ],
} as const satisfies Record<string, readonly string[]>;

export type VillainousSlug = keyof typeof VILLAINOUS_ROSTERS;

/** True when `slug` names one of the Villainous boxes. */
export function isVillainousSlug(slug: string | null | undefined): slug is VillainousSlug {
  return slug !== null && slug !== undefined && slug in VILLAINOUS_ROSTERS;
}

/**
 * Villains selectable for a box. Falls back to the 6-villain superset so a
 * caller holding a non-Villainous slug still gets a usable roster rather than
 * an empty picker.
 */
export function villainsForGame(slug: string | null | undefined): readonly string[] {
  return isVillainousSlug(slug)
    ? VILLAINOUS_ROSTERS[slug]
    : VILLAINOUS_ROSTERS[VILLAINOUS_BASE_SLUG];
}
