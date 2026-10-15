import type { WonderId } from "@boardgames/core/games/7-wonders/types";
import manifest from "../assets/art/manifest.json" with { type: "json" };

/**
 * 7 Wonders' painted art (ART-PROMPTS.md): wonder boards by day and night,
 * crests, Age backs, tokens, icons, Edifice plans and buildings, backdrops
 * and ornaments. `manifest.json` names every image and the size the
 * optimiser (`card-art --game=7-wonders`) shrinks it to; a missing file
 * means that spot draws its drawn fallback.
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
export function artUrl(name: string): string | undefined {
  return urlByName.get(name);
}

export function missingArt(): ArtName[] {
  return (Object.keys(manifest) as ArtName[]).filter((n) => !urlByName.has(n));
}

/** CSS `url(...)` for a background layer, or `none`. */
export function artBg(name: string): string {
  const url = urlByName.get(name);
  return url ? `url("${url}")` : "none";
}

/** Side A is the wonder by day, side B by night — as on the printed boards. */
export function wonderBoardArt(id: WonderId, side: "A" | "B"): string | undefined {
  return urlByName.get(`wonder-${id}-${side === "A" ? "day" : "night"}`);
}

export function crestArt(id: WonderId): string | undefined {
  return urlByName.get(`crest-${id}`);
}

export function ageBackArt(age: 1 | 2 | 3): string | undefined {
  return urlByName.get(`back-age-${age}`);
}

const slug = (name: string) => name.toLowerCase().replace(/\s+/g, "-");

/** An Edifice project: its architect's plan, or the finished building. */
export function edificeArt(name: string, built: boolean): string | undefined {
  return urlByName.get(`edifice-${slug(name)}${built ? "" : "-blueprint"}`);
}

/**
 * Where each wonder's subject sits in its 21:9 board painting (x, y as a
 * fraction), so a crop to a narrower frame keeps the wonder in view.
 * Day and night share one composition.
 */
export const WONDER_FOCUS: Record<WonderId, { x: number; y: number }> = {
  giza: { x: 0.55, y: 0.45 },
  ephesos: { x: 0.68, y: 0.35 },
  olympia: { x: 0.62, y: 0.45 },
  babylon: { x: 0.45, y: 0.4 },
  alexandria: { x: 0.35, y: 0.4 },
  halikarnassos: { x: 0.32, y: 0.4 },
  rhodes: { x: 0.68, y: 0.35 },
};
