import { maxPlayersAsNumber } from "@boardgames/core/bgg";
import type { BggGame, GameDefinition } from "../games/types";

// Pure filter model for the Board Game Lab library top bar. No React, no
// DOM — the component layer (`GameLibraryFilters`) owns the controls and
// passes a `GameFilters` value through `filterGames`. Kept pure so the
// matching rules are unit-testable in isolation.

/** Complexity bucket over BGG `averageWeight` (1..5 scale). */
export type WeightBucket = "light" | "medium" | "heavy";
/** Playing-time bucket over the game's effective playtime, in minutes. */
export type TimeBucket = "short" | "mid" | "long" | "epic";

/**
 * Active filter selection. Every axis is independent and AND-combined:
 * - `query`: free text matched against title, designers, categories, mechanics.
 * - `players`: exact headcount the game must support; the sentinel
 *   `PLAYERS_MAX_PLUS` means "supports that many or more". null = no filter.
 * - `weight` / `time`: single-select buckets; null = no filter on that axis.
 */
export type GameFilters = {
  query: string;
  players: number | null;
  weight: WeightBucket | null;
  time: TimeBucket | null;
  /** Hide catalog-only ("coming soon") entries, keeping only games with a
   *  playable component. Only meaningful in the admin view, which is the
   *  only place catalog-only entries are listed. */
  playableOnly: boolean;
};

export const EMPTY_FILTERS: GameFilters = {
  query: "",
  players: null,
  weight: null,
  time: null,
  playableOnly: false,
};

/** The largest discrete player option; selecting it means "this many or more". */
export const PLAYERS_MAX_PLUS = 6;

export function hasActiveFilters(f: GameFilters): boolean {
  return (
    f.query.trim() !== "" ||
    f.players !== null ||
    f.weight !== null ||
    f.time !== null ||
    f.playableOnly
  );
}

/**
 * Coarse 3-way complexity bucket. Deliberately broader than
 * `bgg-format.ts:weightLabel` (which has 5 display tiers) — filter chips
 * group medium-light/medium and medium-heavy/heavy together so each chip
 * captures a meaningful slice of the catalog. `null` weight → `null`
 * (matches no bucket, so weight-filtered views hide unrated games).
 */
export function weightBucket(w: number | null): WeightBucket | null {
  if (w == null) return null;
  if (w < 2.5) return "light";
  if (w < 3.5) return "medium";
  return "heavy";
}

/** Effective playtime: prefer `playingTime`, then the max/min bounds. */
function effectivePlayTime(bgg: BggGame): number | null {
  return bgg.playingTime ?? bgg.maxPlayTime ?? bgg.minPlayTime ?? null;
}

/** Bucket an effective playtime (minutes) into a band. `null`/0 → `null`. */
export function timeBucket(minutes: number | null): TimeBucket | null {
  if (minutes == null || minutes <= 0) return null;
  if (minutes < 30) return "short";
  if (minutes <= 60) return "mid";
  if (minutes <= 120) return "long";
  return "epic";
}

function supportsPlayerCount(game: GameDefinition, n: number): boolean {
  const min = game.bgg.minPlayers ?? 1;
  const max = maxPlayersAsNumber(game.bgg.maxPlayers);
  // The "N+" chip matches any game whose published max reaches at least N.
  if (n >= PLAYERS_MAX_PLUS) return max >= PLAYERS_MAX_PLUS;
  return min <= n && n <= max;
}

function matchesQuery(game: GameDefinition, q: string): boolean {
  const haystack = [
    game.title,
    ...game.bgg.designers,
    ...game.bgg.categories,
    ...game.bgg.mechanics,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

/**
 * Apply the active filter set to a flat game list. Pure and order-preserving,
 * so the caller can re-group the result into presentation units afterward.
 */
export function filterGames(games: GameDefinition[], filters: GameFilters): GameDefinition[] {
  const q = filters.query.trim().toLowerCase();
  return games.filter((game) => {
    if (filters.playableOnly && game.kind !== "playable") return false;
    if (q && !matchesQuery(game, q)) return false;
    if (filters.players !== null && !supportsPlayerCount(game, filters.players)) return false;
    if (filters.weight !== null && weightBucket(game.bgg.averageWeight) !== filters.weight) {
      return false;
    }
    if (filters.time !== null && timeBucket(effectivePlayTime(game.bgg)) !== filters.time) {
      return false;
    }
    return true;
  });
}
