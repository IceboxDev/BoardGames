import { maxPlayersAsNumber } from "@boardgames/core/bgg";
import { weightStats } from "../games/registry";
import type { BggGame, GameDefinition } from "../games/types";

// Single source of truth for every BGG-snapshot formatter and game-fit
// predicate used by card chrome, carousel cards, BggMeta, and BggInline.
// Pure functions only; no React, no DOM, no Tailwind.

/**
 * "2008 · 1–4 players · 60 min" — joined dot-separated summary used in the
 * catalog grid card meta line. Skips any segment whose data is missing.
 */
export function compactSummary(bgg: BggGame): string {
  const parts: string[] = [];
  if (bgg.yearPublished) parts.push(String(bgg.yearPublished));
  const players = playerRange(bgg, { hideUnknown: true });
  if (players) parts.push(players);
  if (bgg.playingTime) parts.push(`${bgg.playingTime} min`);
  return parts.join(" · ");
}

/**
 * "1–4 players" / "2 players" / "1–∞ players". When `hideUnknown` is set
 * (catalog summary use), returns "" instead of "?" placeholders so the
 * caller can omit the segment entirely; otherwise returns the carousel
 * card's verbose "?–? players" fallback.
 */
export function playerRange(bgg: BggGame, opts: { hideUnknown?: boolean } = {}): string {
  const min = bgg.minPlayers;
  const max = bgg.maxPlayers;
  if (min == null && max == null) return opts.hideUnknown ? "" : "— players";
  if (min === max) return `${min} player${min === 1 ? "" : "s"}`;
  if (opts.hideUnknown && (min == null || max == null)) return "";
  const maxLabel = max === "infinity" ? "∞" : (max ?? "?");
  return `${min ?? "?"}–${maxLabel} players`;
}

/**
 * "30–60 min" when the range is non-degenerate, else "X min" from
 * `playingTime` / `minPlayTime` / `maxPlayTime` in that fallback order.
 * Returns "— min" when no playtime is available; carousel cards rely on
 * the placeholder so the meta line keeps a stable structure.
 */
export function playTime(bgg: BggGame): string {
  const minT = bgg.minPlayTime;
  const maxT = bgg.maxPlayTime;
  if (minT && maxT && minT !== maxT) return `${minT}–${maxT} min`;
  const t = bgg.playingTime ?? minT ?? maxT;
  if (!t) return "— min";
  return `${t} min`;
}

/**
 * Does the game's published player count overlap with the [lo, hi] headcount
 * window of a planned game night? Loose / overlap-style — true as long as
 * SOME subset of the window can play the game. Used by the carousel
 * "Fits X" badge to surface games that work for the confirmed-yes count
 * even if maybes would overflow.
 */
export function fitsRange(game: GameDefinition, lo: number, hi: number): boolean {
  const min = game.bgg.minPlayers ?? 0;
  const max = maxPlayersAsNumber(game.bgg.maxPlayers);
  return min <= hi && max >= lo;
}

/**
 * Stricter sibling of `fitsRange`: the game must accommodate EVERY headcount
 * in the [lo, hi] window. Equivalent to `min ≤ lo && max ≥ hi`. Used by
 * `RsvpModal` when suggesting games for a night with confirmed + tentative
 * attendees — a max-4 game on a 4-going/3-maybe night would lock out the
 * maybes, so it isn't suggested.
 */
export function coversWindow(game: GameDefinition, lo: number, hi: number): boolean {
  const min = game.bgg.minPlayers ?? 0;
  const max = maxPlayersAsNumber(game.bgg.maxPlayers);
  return min <= lo && max >= hi;
}

/** "4" when lo===hi, otherwise "3–5". Used in the carousel's fits badge. */
export function fitsLabel(lo: number, hi: number): string {
  if (lo === hi) return String(lo);
  return `${lo}–${hi}`;
}

/** BGG "averageWeight" bucket label. 1–5 scale; thresholds are conventional. */
export function weightLabel(w: number): string {
  if (w < 2) return "Light";
  if (w < 3) return "Medium-light";
  if (w < 3.5) return "Medium";
  if (w < 4) return "Medium-heavy";
  return "Heavy";
}

/**
 * Compact count formatter — "1.2k", "10k", "850". The thousand-cut at 1k and
 * the precision flip at 10k keep ratings counts readable in both contexts
 * (under 10k uses one decimal; over 10k drops it).
 */
export function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

/**
 * Normalize a weight (1..5) onto 0..100 against the registry's lightest and
 * heaviest games, so the complexity bar uses its full visible range across
 * the catalog instead of squishing into the 1–5 band. Falls back to a flat
 * 50% bar when every game in the registry has the same weight (degenerate).
 */
export function normalizeWeight(w: number): number {
  const { min, max } = weightStats;
  if (max <= min) return 50;
  const ratio = (w - min) / (max - min);
  return Math.max(0, Math.min(100, ratio * 100));
}

/**
 * BGG descriptions ship as HTML with entity-encoded punctuation. Strip tags
 * and the handful of entities BGG actually emits so the text renders as
 * plain prose inside the card description block.
 */
export function stripBggHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&#10;/g, " ")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
