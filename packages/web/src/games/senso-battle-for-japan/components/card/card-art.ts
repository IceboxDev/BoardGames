import { isNinja, rankOf, suitOf } from "@boardgames/core/games/senso-battle-for-japan/deck";
import type { CardId, Clan } from "@boardgames/core/games/senso-battle-for-japan/types";
import manifest from "../../assets/cards/manifest.json" with { type: "json" };

/**
 * The deck's art blocks. `manifest.json` names every block the compositor
 * can draw and the size the optimiser shrinks it to; the webp files beside
 * it are whatever has been generated so far — a missing file simply means
 * that layer draws its fallback, so the deck is complete before any art
 * exists and each block lights up the moment its file lands.
 */
export type ArtName = keyof typeof manifest;

export const ART_MANIFEST = manifest;

export const ART_NAMES = Object.keys(manifest) as ArtName[];

const ART_URLS = import.meta.glob<string>("../../assets/cards/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});

const urlByName = new Map<string, string>();
for (const [path, url] of Object.entries(ART_URLS)) {
  const file = path.slice(path.lastIndexOf("/") + 1);
  urlByName.set(file.replace(/\.webp$/, ""), url);
}

/** The URL of a block, or `undefined` while its art has not been generated. */
export function cardArtUrl(name: ArtName): string | undefined {
  return urlByName.get(name);
}

/** Every webp on disk that the manifest does not know — a typo or a stale file. */
export function orphanCardArt(): string[] {
  return [...urlByName.keys()].filter((n) => !(n in manifest)).sort();
}

export function missingCardArt(): ArtName[] {
  return ART_NAMES.filter((n) => !urlByName.has(n));
}

export const COURT_NAMES: Record<11 | 12 | 13, "jack" | "queen" | "king"> = {
  11: "jack",
  12: "queen",
  13: "king",
};

export function crestArt(clan: Clan, small = false): ArtName {
  return (small ? `crest-${clan}-sm` : `crest-${clan}`) as ArtName;
}

/** The blocks one card draws, so the gallery can flag what it is still missing. */
export function artNamesFor(card: CardId, clanOnly = false): ArtName[] {
  if (isNinja(card)) return [card, "kanji-ninja", "paper-grain"];
  const clan = suitOf(card);
  if (!clan) return [];
  const rank = rankOf(card);
  const names: ArtName[] = [crestArt(clan, true), `kanji-${clan}` as ArtName, "paper-grain"];
  if (clanOnly) return [crestArt(clan), `kanji-${clan}` as ArtName, "paper-grain"];
  if (rank === 14) names.push(crestArt(clan), "ace-halo");
  else if (rank >= 11) names.push(`court-${clan}-${COURT_NAMES[rank as 11 | 12 | 13]}` as ArtName);
  return names;
}

/**
 * Decode every block as soon as this module loads — while the setup screen
 * or the lobby is up — so the first hand paints with its art (the map's
 * warm-up pattern). Skipped in tests, where nothing is ever painted.
 */
export function warmCardArt(): void {
  if (typeof Image === "undefined") return;
  for (const url of urlByName.values()) {
    const warm = new Image();
    warm.decoding = "async";
    warm.src = url;
    warm.decode().catch(() => {});
  }
}

if (!import.meta.env.TEST) warmCardArt();
