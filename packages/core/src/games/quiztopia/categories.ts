// The twelve Quiztopia categories, in card order. Position on the physical
// card decides the category: the pink band holds 1–4, the blue band 5–8 and
// the sand band 9–12 (top-left, top-right, bottom-left, bottom-right around
// each band's icon circle). Every building card of the board game maps to
// exactly one of these, so the same list drives the deck, the trainer and
// the wiki.

export type CategoryBand = "pink" | "blue" | "sand";

export interface QuiztopiaCategory {
  /** 1-based position, identical to the `n` in the content files. */
  readonly n: number;
  readonly en: string;
  readonly de: string;
  readonly band: CategoryBand;
  /** URL-safe slug used by the trainer / wiki routes. */
  readonly slug: string;
}

export const QUIZTOPIA_CATEGORIES: readonly QuiztopiaCategory[] = [
  { n: 1, en: "Stage & Music", de: "Bühne & Musik", band: "pink", slug: "stage-music" },
  {
    n: 2,
    en: "Language & Literature",
    de: "Sprache & Literatur",
    band: "pink",
    slug: "literature",
  },
  { n: 3, en: "Art & Architecture", de: "Kunst & Architektur", band: "pink", slug: "art" },
  { n: 4, en: "Film & TV", de: "Film & Fernsehen", band: "pink", slug: "film-tv" },
  { n: 5, en: "Sport & Games", de: "Sport & Spiel", band: "blue", slug: "sport" },
  { n: 6, en: "History & Society", de: "Geschichte & Gesellschaft", band: "blue", slug: "history" },
  { n: 7, en: "Business & Politics", de: "Wirtschaft & Politik", band: "blue", slug: "politics" },
  {
    n: 8,
    en: "Religion & Philosophy",
    de: "Religion & Philosophie",
    band: "blue",
    slug: "philosophy",
  },
  { n: 9, en: "Medicine & Science", de: "Medizin & Wissenschaft", band: "sand", slug: "science" },
  { n: 10, en: "Earth & Space", de: "Erde & Weltall", band: "sand", slug: "earth-space" },
  { n: 11, en: "Flora & Fauna", de: "Flora & Fauna", band: "sand", slug: "nature" },
  {
    n: 12,
    en: "Computers & Technology",
    de: "Computer & Technik",
    band: "sand",
    slug: "technology",
  },
] as const;

export const CATEGORY_COUNT = 12;

export function categoryByN(n: number): QuiztopiaCategory | undefined {
  return QUIZTOPIA_CATEGORIES[n - 1];
}

export function categoryBySlug(slug: string): QuiztopiaCategory | undefined {
  return QUIZTOPIA_CATEGORIES.find((c) => c.slug === slug);
}

/** 0-based building index (the engine's `buildingIndex`) → category. */
export function categoryByIndex(index: number): QuiztopiaCategory | undefined {
  return QUIZTOPIA_CATEGORIES[index];
}
