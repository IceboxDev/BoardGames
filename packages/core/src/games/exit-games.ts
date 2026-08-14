// The EXIT: The Game box list — every physical EXIT release (main line, Kids,
// Family, game+puzzle hybrids, advent calendars, and the SPIEL '16 promo).
//
// These are deliberately NOT catalog entries: the catalog drives the game
// gallery, the RSVP carousel, and the thumbnail/description completeness
// tests, none of which should surface ~50 near-identical escape-room boxes.
// The catalog carries a single votable "exit" entry instead; the boxes below
// exist so that
//   1. individual boxes can be marked owned in a user's inventory
//      (`CatalogSlugListSchema` in `protocol/http/inventory.ts` accepts them), and
//   2. a sealed night whose vote winner is "exit" can run a second-stage
//      narrowing vote over the specific boxes (`protocol/http/exit.ts`).
//
// Source: the German Wikipedia release table (de titles, dates, difficulty),
// cross-checked against the BGG "Series: EXIT: The Game (KOSMOS)" family for
// ids and English titles. `titleEn: null` means no English edition exists;
// `bggId: null` means the box has no BGG entry yet.

/** The catalog slug of the votable EXIT anchor entry. */
export const EXIT_CATALOG_SLUG = "exit";

export type ExitDifficulty = "beginner" | "advanced" | "expert" | "kids" | "family";

export type ExitSeries =
  | "main" // the numbered core line
  | "kids" // EXIT Kids
  | "family" // Family line (two games per box)
  | "puzzle" // game + jigsaw-puzzle hybrids
  | "advent" // advent-calendar games
  | "promo"; // one-off promotional scenarios

export interface ExitGame {
  /** Kebab slug, always `exit-` prefixed. Valid per `GameSlugSchema`. */
  slug: string;
  titleEn: string | null;
  titleDe: string;
  bggId: number | null;
  year: number;
  /** KOSMOS box difficulty; null for the unrated promo. */
  difficulty: ExitDifficulty | null;
  series: ExitSeries;
}

export const EXIT_GAMES: readonly ExitGame[] = [
  // ── 2016 ──
  {
    slug: "exit-secret-of-the-premiere",
    titleEn: "The Secret of the Premiere",
    titleDe: "Das Geheimnis der Premiere",
    bggId: 206943,
    year: 2016,
    difficulty: null,
    series: "promo",
  },
  {
    slug: "exit-secret-lab",
    titleEn: "The Secret Lab",
    titleDe: "Das geheime Labor",
    bggId: 203417,
    year: 2016,
    difficulty: "advanced",
    series: "main",
  },
  {
    slug: "exit-abandoned-cabin",
    titleEn: "The Abandoned Cabin",
    titleDe: "Die verlassene Hütte",
    bggId: 203420,
    year: 2016,
    difficulty: "advanced",
    series: "main",
  },
  {
    slug: "exit-pharaohs-tomb",
    titleEn: "The Pharaoh's Tomb",
    titleDe: "Die Grabkammer des Pharao",
    bggId: 203416,
    year: 2016,
    difficulty: "expert",
    series: "main",
  },
  // ── 2017 ──
  {
    slug: "exit-forbidden-castle",
    titleEn: "The Forbidden Castle",
    titleDe: "Die verbotene Burg",
    bggId: 215840,
    year: 2017,
    difficulty: "expert",
    series: "main",
  },
  {
    slug: "exit-polar-station",
    titleEn: "The Polar Station",
    titleDe: "Die Station im ewigen Eis",
    bggId: 215842,
    year: 2017,
    difficulty: "advanced",
    series: "main",
  },
  {
    slug: "exit-forgotten-island",
    titleEn: "The Forgotten Island",
    titleDe: "Die vergessene Insel",
    bggId: 215841,
    year: 2017,
    difficulty: "advanced",
    series: "main",
  },
  {
    slug: "exit-dead-man-orient-express",
    titleEn: "Dead Man on the Orient Express",
    titleDe: "Der Tote im Orient-Express",
    bggId: 226522,
    year: 2017,
    difficulty: "expert",
    series: "main",
  },
  {
    slug: "exit-house-of-riddles",
    titleEn: "The House of Riddles",
    titleDe: "Das Haus der Rätsel",
    bggId: 226519,
    year: 2017,
    difficulty: "beginner",
    series: "main",
  },
  {
    slug: "exit-sunken-treasure",
    titleEn: "The Sunken Treasure",
    titleDe: "Der versunkene Schatz",
    bggId: 226518,
    year: 2017,
    difficulty: "beginner",
    series: "main",
  },
  // ── 2018 ──
  {
    slug: "exit-sinister-mansion",
    titleEn: "The Sinister Mansion",
    titleDe: "Die unheimliche Villa",
    bggId: 226520,
    year: 2018,
    difficulty: "advanced",
    series: "main",
  },
  {
    slug: "exit-mysterious-museum",
    titleEn: "The Mysterious Museum",
    titleDe: "Das mysteriöse Museum",
    bggId: 244918,
    year: 2018,
    difficulty: "beginner",
    series: "main",
  },
  {
    slug: "exit-kids-code-breaker",
    titleEn: "Code Breaker",
    titleDe: "CODE BREAKER",
    bggId: 259724,
    year: 2018,
    difficulty: "kids",
    series: "kids",
  },
  {
    slug: "exit-catacombs-of-horror",
    titleEn: "The Catacombs of Horror",
    titleDe: "Die Katakomben des Grauens",
    bggId: 255675,
    year: 2018,
    difficulty: "advanced",
    series: "main",
  },
  // ── 2019 ──
  {
    slug: "exit-haunted-roller-coaster",
    titleEn: "The Haunted Roller Coaster",
    titleDe: "Die Geisterbahn des Schreckens",
    bggId: 269968,
    year: 2019,
    difficulty: "beginner",
    series: "main",
  },
  {
    slug: "exit-kaenguru-eskapaden",
    titleEn: null,
    titleDe: "Die Känguru-Eskapaden",
    bggId: 269967,
    year: 2019,
    difficulty: "advanced",
    series: "main",
  },
  {
    slug: "exit-stormy-flight",
    titleEn: "The Stormy Flight",
    titleDe: "Der Flug ins Ungewisse",
    bggId: 283797,
    year: 2019,
    difficulty: "beginner",
    series: "main",
  },
  {
    slug: "exit-theft-on-the-mississippi",
    titleEn: "Theft on the Mississippi",
    titleDe: "Der Raub auf dem Mississippi",
    bggId: 283934,
    year: 2019,
    difficulty: "advanced",
    series: "main",
  },
  // ── 2020 ──
  {
    slug: "exit-puzzle-sacred-temple",
    titleEn: "The Sacred Temple",
    titleDe: "Der verschollene Tempel",
    bggId: 298281,
    year: 2020,
    difficulty: "beginner",
    series: "puzzle",
  },
  {
    slug: "exit-puzzle-deserted-lighthouse",
    titleEn: "The Deserted Lighthouse",
    titleDe: "Der einsame Leuchtturm",
    bggId: 298282,
    year: 2020,
    difficulty: "advanced",
    series: "puzzle",
  },
  {
    slug: "exit-enchanted-forest",
    titleEn: "The Enchanted Forest",
    titleDe: "Der verwunschene Wald",
    bggId: 295944,
    year: 2020,
    difficulty: "beginner",
    series: "main",
  },
  {
    slug: "exit-cemetery-of-the-knight",
    titleEn: "The Cemetery of the Knight",
    titleDe: "Der Friedhof der Finsternis",
    bggId: 295945,
    year: 2020,
    difficulty: "advanced",
    series: "main",
  },
  {
    slug: "exit-advent-ice-cave",
    titleEn: "The Mystery of the Ice Cave",
    titleDe: "Die geheimnisvolle Eishöhle",
    bggId: 317434,
    year: 2020,
    difficulty: "beginner",
    series: "advent",
  },
  {
    slug: "exit-gate-between-worlds",
    titleEn: "The Gate Between Worlds",
    titleDe: "Das Tor zwischen den Welten",
    bggId: 317372,
    year: 2020,
    difficulty: "advanced",
    series: "main",
  },
  // ── 2021 ──
  {
    slug: "exit-cursed-labyrinth",
    titleEn: "The Cursed Labyrinth",
    titleDe: "Das verfluchte Labyrinth",
    bggId: 317432,
    year: 2021,
    difficulty: "beginner",
    series: "main",
  },
  {
    slug: "exit-kidnapped-in-fortune-city",
    titleEn: "Kidnapped in Fortune City",
    titleDe: "Die Entführung in Fortune City",
    bggId: 324853,
    year: 2021,
    difficulty: "advanced",
    series: "main",
  },
  {
    slug: "exit-advent-golden-book",
    titleEn: "The Hunt for the Golden Book",
    titleDe: "Die Jagd nach dem goldenen Buch",
    bggId: 343322,
    year: 2021,
    difficulty: "beginner",
    series: "advent",
  },
  {
    slug: "exit-return-abandoned-cabin",
    titleEn: "The Return to the Abandoned Cabin",
    titleDe: "Die Rückkehr in die verlassene Hütte",
    bggId: 341583,
    year: 2021,
    difficulty: "advanced",
    series: "main",
  },
  {
    slug: "exit-puzzle-nightfall-manor",
    titleEn: "Nightfall Manor",
    titleDe: "Das dunkle Schloss",
    bggId: 333516,
    year: 2021,
    difficulty: "beginner",
    series: "puzzle",
  },
  // ── 2022 ──
  {
    slug: "exit-shadows-over-middle-earth",
    titleEn: "The Lord of the Rings: Shadows over Middle-earth",
    titleDe: "Schatten über Mittelerde",
    bggId: 341573,
    year: 2022,
    difficulty: "beginner",
    series: "main",
  },
  {
    slug: "exit-professors-last-riddle",
    titleEn: "The Professor's Last Riddle",
    titleDe: "Das Vermächtnis des Weltreisenden",
    bggId: 356313,
    year: 2022,
    difficulty: "advanced",
    series: "main",
  },
  {
    slug: "exit-puzzle-gold-of-the-pirates",
    titleEn: "The Gold of the Pirates",
    titleDe: "Das Gold der Piraten",
    bggId: 356312,
    year: 2022,
    difficulty: "advanced",
    series: "puzzle",
  },
  {
    slug: "exit-kids-jungle-of-riddles",
    titleEn: "Jungle of Riddles",
    titleDe: "Rätselspaß im Dschungel",
    bggId: 366316,
    year: 2022,
    difficulty: "kids",
    series: "kids",
  },
  {
    slug: "exit-advent-silent-storm",
    titleEn: "The Silent Storm",
    titleDe: "Der lautlose Sturm",
    bggId: 356314,
    year: 2022,
    difficulty: "beginner",
    series: "advent",
  },
  {
    slug: "exit-disappearance-sherlock-holmes",
    titleEn: "The Disappearance of Sherlock Holmes",
    titleDe: "Das Verschwinden des Sherlock Holmes",
    bggId: 366318,
    year: 2022,
    difficulty: "advanced",
    series: "main",
  },
  // ── 2023 ──
  {
    slug: "exit-kids-riddles-in-monsterville",
    titleEn: "Riddles in Monsterville",
    titleDe: "Monstermäßiger Rätselspaß",
    bggId: 376479,
    year: 2023,
    difficulty: "kids",
    series: "kids",
  },
  {
    slug: "exit-magical-academy",
    titleEn: "The Magical Academy",
    titleDe: "Die Akademie der Zauberkünste",
    bggId: 376477,
    year: 2023,
    difficulty: "beginner",
    series: "main",
  },
  {
    slug: "exit-hunt-through-amsterdam",
    titleEn: "The Hunt Through Amsterdam",
    titleDe: "Die Jagd durch Amsterdam",
    bggId: 376478,
    year: 2023,
    difficulty: "advanced",
    series: "main",
  },
  {
    slug: "exit-prison-break",
    titleEn: "Prison Break",
    titleDe: "Der Gefängnisausbruch",
    bggId: 383479,
    year: 2023,
    difficulty: "expert",
    series: "main",
  },
  {
    slug: "exit-advent-missing-hollywood-star",
    titleEn: "The Missing Hollywood Star",
    titleDe: "Der verschwundene Hollywood-Star",
    bggId: 394735,
    year: 2023,
    difficulty: "beginner",
    series: "advent",
  },
  // ── 2024 ──
  {
    slug: "exit-kids-midnight-spooktacular",
    titleEn: "Midnight Spooktacular",
    titleDe: "Gruseliger Rätselspaß",
    bggId: 406314,
    year: 2024,
    difficulty: "kids",
    series: "kids",
  },
  {
    slug: "exit-venice-conspiracy",
    titleEn: "The Venice Conspiracy",
    titleDe: "Die Venedig-Verschwörung",
    bggId: 406312,
    year: 2024,
    difficulty: "advanced",
    series: "main",
  },
  {
    slug: "exit-family-meanstone-candy",
    titleEn: "The Mystery at Meanstone Manor / The Caper at Candy Castle",
    titleDe: "Schloss Gemeinstein / Mission Candyland",
    bggId: 424978,
    year: 2024,
    difficulty: "family",
    series: "family",
  },
  {
    slug: "exit-advent-intergalactic-race",
    titleEn: "The Intergalactic Race",
    titleDe: "Das intergalaktische Wettrennen",
    bggId: 430765,
    year: 2024,
    difficulty: "beginner",
    series: "advent",
  },
  // ── 2025 ──
  {
    slug: "exit-kids-great-bee-scape",
    titleEn: "The Great Bee-scape",
    titleDe: "Krabbeliger Rätselspaß",
    bggId: 449213,
    year: 2025,
    difficulty: "kids",
    series: "kids",
  },
  {
    slug: "exit-adventures-on-catan",
    titleEn: "Adventures on Catan",
    titleDe: "Abenteuer auf Catan",
    bggId: 437214,
    year: 2025,
    difficulty: "beginner",
    series: "main",
  },
  {
    slug: "exit-circus-mystery",
    titleEn: "The Circus Mystery",
    titleDe: "Die letzte Vorstellung",
    bggId: 445019,
    year: 2025,
    difficulty: "advanced",
    series: "main",
  },
  {
    slug: "exit-family-trophy-carnival",
    titleEn: "The Trophy Case / Night at the Carnival",
    titleDe: "Backstage Boys / Jahrmarkt im Dunkeln",
    bggId: 446885,
    year: 2025,
    difficulty: "family",
    series: "family",
  },
  {
    slug: "exit-advent-magic-of-christmas",
    titleEn: "The Magic of Christmas",
    titleDe: "Der Zauber von Weihnachten",
    bggId: 445020,
    year: 2025,
    difficulty: "beginner",
    series: "advent",
  },
  // ── 2026 ──
  {
    slug: "exit-kids-puzzle-fun-in-the-sea",
    titleEn: "Puzzle Fun in the Sea",
    titleDe: "Rätselspaß im Meer",
    bggId: 468525,
    year: 2026,
    difficulty: "kids",
    series: "kids",
  },
  {
    slug: "exit-family-lost-pirate-treasure",
    titleEn: "The Lost Pirate Treasure",
    titleDe: "Der verlorene Piratenschatz",
    bggId: 475426,
    year: 2026,
    difficulty: "family",
    series: "family",
  },
  {
    slug: "exit-fourth-wing-first-year",
    titleEn: "Fourth Wing: The First Year",
    titleDe: "Fourth Wing – Das erste Jahr",
    bggId: 475427,
    year: 2026,
    difficulty: "beginner",
    series: "main",
  },
  {
    slug: "exit-perfect-heist",
    titleEn: "The Perfect Heist",
    titleDe: "Der perfekte Einbruch",
    bggId: 462524,
    year: 2026,
    difficulty: "advanced",
    series: "main",
  },
  {
    slug: "exit-advent-hidden-level",
    titleEn: null,
    titleDe: "Das versteckte Level",
    bggId: null,
    year: 2026,
    difficulty: "beginner",
    series: "advent",
  },
];

/** Every EXIT box slug. */
export const EXIT_GAME_SLUGS: ReadonlySet<string> = new Set(EXIT_GAMES.map((g) => g.slug));

/** True when `slug` names an individual EXIT box. */
export function isExitGameSlug(slug: string): boolean {
  return EXIT_GAME_SLUGS.has(slug);
}

/**
 * Owning any individual EXIT box implies owning the votable "exit" catalog
 * anchor, so EXIT surfaces in a night's availability without anyone having to
 * mark the anchor by hand. Mutates and returns the given set.
 */
export function withExitAnchor(slugs: Set<string>): Set<string> {
  for (const slug of slugs) {
    if (EXIT_GAME_SLUGS.has(slug)) {
      slugs.add(EXIT_CATALOG_SLUG);
      break;
    }
  }
  return slugs;
}

/** Lookup by slug; undefined for unknown slugs. */
export function exitGameBySlug(slug: string): ExitGame | undefined {
  return EXIT_GAMES.find((g) => g.slug === slug);
}

/** Display title: English where an English edition exists, else German. */
export function exitGameTitle(game: ExitGame): string {
  return game.titleEn ?? game.titleDe;
}
