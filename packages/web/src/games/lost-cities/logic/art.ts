import type { Card, ExpeditionColor } from "@boardgames/core/games/lost-cities/types";
import manifest from "../assets/art/manifest.json" with { type: "json" };

/**
 * Lost Cities' painted art (ART-PROMPTS.md): the 60 card paintings, the five
 * trail backdrops, the medallions and insignia, and the card back.
 * `manifest.json` names every image and the size the optimiser
 * (`card-art --game=lost-cities`) shrinks it to; a missing file means that
 * spot draws its fallback.
 */
export type ArtName = keyof typeof manifest;

const ART_URLS = import.meta.glob<string>("../assets/art/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});

const urlByName = new Map<string, string>();
for (const [path, url] of Object.entries(ART_URLS)) {
  urlByName.set(path.slice(path.lastIndexOf("/") + 1).replace(/\.webp$/, ""), url);
}

/** The URL of an image, or `undefined` while it has not been generated. */
export function artUrl(name: ArtName): string | undefined {
  return urlByName.get(name);
}

/** Which of an expedition's three wagers a card is (1–3), from its deck id. */
function wagerIndex(card: Card): number {
  return (card.id % 12) + 1;
}

/** The painting on a card: `card-yellow-w2`, `card-blue-7`, … */
export function cardArtName(card: Card): ArtName {
  const key = card.type === "wager" ? `w${wagerIndex(card)}` : String(card.value);
  return `card-${card.color}-${key}` as ArtName;
}

/** The tall painting behind an expedition's column; its 10 until the trail exists. */
export function trailArt(color: ExpeditionColor): string | undefined {
  return artUrl(`trail-${color}` as ArtName) ?? artUrl(`card-${color}-10` as ArtName);
}
