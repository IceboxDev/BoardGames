import { cardDef, VAMPIRES } from "@boardgames/core/games/the-hunger/content/cards";
import type { HumanCategory, Keyword, SpaceEffect } from "@boardgames/core/games/the-hunger/types";
import manifest from "../assets/cards/manifest.json" with { type: "json" };

/**
 * The Hunger's art blocks. `manifest.json` names every block CARD-PROMPTS.md
 * asks for and the size the optimiser (`card-art --game=hunger`) shrinks it
 * to; the webp files beside it are whatever has been generated so far. A
 * missing file means that spot draws its fallback, so each block lights up
 * the moment its file lands.
 */
export type ArtName = keyof typeof manifest;

const ART_URLS = import.meta.glob<string>("../assets/cards/*.webp", {
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
export function artUrl(name: ArtName): string | undefined {
  return urlByName.get(name);
}

export function missingArt(): ArtName[] {
  return (Object.keys(manifest) as ArtName[]).filter((n) => !urlByName.has(n));
}

export type VampireArt = "bust" | "full" | "sigil";

/** A Vampire's portrait, full figure or seat crest, if generated. */
export function vampireArt(vampire: number, kind: VampireArt): string | undefined {
  const id = VAMPIRES[vampire]?.id;
  return id ? urlByName.get(`vampire-${id}-${kind}`) : undefined;
}

/**
 * Where each Vampire's face sits on their portrait, as a fraction of its
 * width and height, so a round avatar can crop to it (checked at 2.3× zoom).
 */
const FACE: Record<string, { x: number; y: number }> = {
  rajesh: { x: 0.45, y: 0.14 },
  boris: { x: 0.44, y: 0.16 },
  josephine: { x: 0.49, y: 0.19 },
  beatrice: { x: 0.46, y: 0.15 },
  yoko: { x: 0.46, y: 0.17 },
  gervasi: { x: 0.43, y: 0.15 },
};

export function vampireFace(vampire: number): { x: number; y: number } {
  return FACE[VAMPIRES[vampire]?.id ?? ""] ?? { x: 0.5, y: 0.15 };
}

/** Familiars share one picture per effect (CARD-PROMPTS.md, batch 12). */
const FAMILIAR_ART: Record<string, string> = {
  nanny: "goat",
  capra: "goat",
  echo: "wolf",
  bo: "wolf",
  gray: "wolf",
  jahda: "wolf",
  tyson: "pigeon",
  porumbel: "pigeon",
  kutya: "dog",
  caine: "dog",
  chop: "pig",
  malac: "pig",
  sova: "owl",
  bagoly: "owl",
  "wee-vlad": "rat",
  patcani: "rat",
  wiggles: "snake",
  kaa: "snake",
  ursa: "bear",
  teddy: "bear",
  lockjaw: "panther",
  nanoosh: "panther",
};

/** Cards that share a picture with a same-named card. */
const SHARED_ART: Record<string, string> = {
  "vampiric-will-double": "power-vampiric-will",
  "vampiric-strength-great": "power-vampiric-strength",
  "vampiric-speed-2": "power-vampiric-speed",
  "vampiric-speed-3": "power-vampiric-speed",
  "eternal-rose": "rose-eternal",
  "dead-rose": "rose-dead",
  "perfect-rose": "rose-perfect",
  "s-the-hunger": "starting-the-hunger",
  "vampire-speed-2": "starting-vampire-speed",
  "vampire-speed-3": "starting-vampire-speed",
  "vampire-speed-4": "starting-vampire-speed",
  "vampire-thirst": "starting-vampire-thirst",
  "s-vampire-strength": "starting-vampire-strength",
};

/** The picture a card (physical id or def id) draws, if it has been generated. */
export function cardArtUrl(card: string): string | undefined {
  const def = cardDef(card);
  const name =
    SHARED_ART[def.id] ??
    (def.type === "familiar" ? `familiar-${FAMILIAR_ART[def.id]}` : `${def.type}-${def.id}`);
  return urlByName.get(name);
}

/** The backdrop behind a card's figure: its faction, or its kind. */
export function cardBackdropUrl(card: string): string | undefined {
  const def = cardDef(card);
  const tone =
    def.category ?? (def.type === "familiar" ? "familiar" : def.type === "item" ? "rose" : "power");
  return urlByName.get(`backdrop-${tone}`);
}

/** The icon file for each keyword, Human type, card kind and board space. */
export const KEYWORD_ICON: Record<Keyword, ArtName> = {
  fast: "icon-fast",
  slow: "icon-slow",
  spicy: "icon-spicy",
  confuse: "icon-confuse",
  "holy-water": "icon-holy-water",
  gregarious: "icon-gregarious",
  ready: "icon-ready",
  permanent: "icon-permanent",
  unique: "icon-unique",
  inspiring: "icon-inspiring",
};

export const CATEGORY_ICON: Record<HumanCategory, ArtName> = {
  villager: "icon-villager",
  religious: "icon-religious",
  military: "icon-military",
  noble: "icon-noble",
};

/** A card's kind icon: its Human type, or Familiar / Power / Starting / Rose. */
export function kindIcon(card: string): ArtName {
  const def = cardDef(card);
  if (def.category) return CATEGORY_ICON[def.category];
  if (def.type === "familiar") return "icon-familiar";
  if (def.type === "power") return "icon-power";
  if (def.type === "starting") return "icon-starting";
  return "icon-item-rose";
}

export const EFFECT_ICON: Partial<Record<SpaceEffect, ArtName>> = {
  castle: "icon-space-castle",
  cemetery: "icon-space-cemetery",
  chest: "icon-chest",
  "chest-open": "icon-chest-open",
  crypt: "icon-crypt",
  labyrinth: "icon-labyrinth",
  market: "icon-market",
  church: "icon-church",
  mansion: "icon-mansion",
  barracks: "icon-barracks",
  ship: "icon-ship",
  tavern: "icon-tavern",
  well: "icon-well",
};

/** Icons drawn in their own colours; every other icon is white ink, recoloured by the UI. */
export const COLOR_ICONS: ReadonlySet<ArtName> = new Set(["icon-vp", "icon-spicy", "icon-instant"]);
