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

// Display labels for the "Boxes in play" variant multiselect. The group owns
// both boxes and mixes villains across them, so a match records which boxes
// were on the table (stored joined in `scenario`, like Dungeon Mayhem's sets).
export const VILLAINOUS_BOX_OPTIONS = [
  { label: "Introduction to Evil", slug: VILLAINOUS_INTRO_SLUG },
  { label: "The Worst Takes It All", slug: VILLAINOUS_BASE_SLUG },
] as const;

/** The box label the picked catalog game should pre-check. */
export function defaultBoxLabelForGame(slug: VillainousSlug): string {
  const match = VILLAINOUS_BOX_OPTIONS.find((b) => b.slug === slug);
  return match?.label ?? VILLAINOUS_BOX_OPTIONS[1].label;
}

/**
 * Union roster for the boxes in play (deduped — Introduction to Evil's four
 * villains all reappear in The Worst Takes It All), in base-roster order.
 * With no boxes picked yet, falls back to the catalog game's own roster so
 * the form is never empty.
 */
export function villainsForBoxes(
  boxLabels: ReadonlyArray<string>,
  fallbackSlug: string | null | undefined,
): readonly string[] {
  const slugs = VILLAINOUS_BOX_OPTIONS.filter((b) => boxLabels.includes(b.label)).map(
    (b) => b.slug,
  );
  if (slugs.length === 0) return villainsForGame(fallbackSlug);
  const union = new Set(slugs.flatMap((s) => VILLAINOUS_ROSTERS[s]));
  return VILLAINOUS_ROSTERS[VILLAINOUS_BASE_SLUG].filter((v) => union.has(v));
}
