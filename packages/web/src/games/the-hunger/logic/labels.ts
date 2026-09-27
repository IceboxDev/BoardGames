import { graphFor } from "@boardgames/core/games/the-hunger/board";
import { bonusDef } from "@boardgames/core/games/the-hunger/content/bonus-tokens";
import { cardDef, VAMPIRES } from "@boardgames/core/games/the-hunger/content/cards";
import { missionDef } from "@boardgames/core/games/the-hunger/content/missions";
import type {
  GameOptions,
  HumanCategory,
  HungerPlayerView,
  SpaceEffect,
} from "@boardgames/core/games/the-hunger/types";

export function cardName(id: string): string {
  return cardDef(id).name;
}

export function missionName(id: string): string {
  return missionDef(id).name;
}

/** A short label for a face-up Bonus token on the map. */
export function bonusShort(id: string): string {
  const b = bonusDef(id).bonus;
  switch (b.kind) {
    case "human":
      return `${CATEGORY_GLYPH[b.category]} ${CATEGORY_LABEL[b.category]}`;
    case "human-choice":
      return "👤 Any Human";
    case "speed":
      return `+${b.n} Speed`;
    case "extra-hunt":
      return "+1 Hunt";
    case "discard-draw":
      return "♻ Discard/Draw";
    case "draw-to-play":
      return "🂠 Draw";
    case "mission":
      return "📜 Mission";
    case "parasol":
      return "☂ Parasol";
    case "velvet":
      return "🧥 +2 VP";
  }
}

export function bonusName(id: string): string {
  return bonusDef(id).name;
}

export function vampireColor(vampire: number): string {
  return VAMPIRES[vampire]?.color ?? "#999999";
}

export function vampireName(vampire: number): string {
  return VAMPIRES[vampire]?.name ?? `Vampire ${vampire + 1}`;
}

/** A Vampire's first name alone: "Rajesh", "Beatrice", "Gervasi". */
export function vampireShortName(vampire: number): string {
  return VAMPIRES[vampire]?.short ?? `Vampire ${vampire + 1}`;
}

/**
 * The short form of `seatLabel` for running text (History): "You", a room
 * player's first name, or the Vampire's first name.
 */
export function seatShortLabel(
  view: Pick<HungerPlayerView, "me" | "players">,
  seat: number,
  names: readonly (string | null)[],
): string {
  if (seat === view.me) return "You";
  const name = names[seat];
  if (name) return name.trim().split(/\s+/)[0] ?? name;
  const p = view.players[seat];
  return p ? vampireShortName(p.vampire) : `Seat ${seat + 1}`;
}

/** "You", a room player's name, or the seat's Vampire. */
export function seatLabel(
  view: Pick<HungerPlayerView, "me" | "players">,
  seat: number,
  names: readonly (string | null)[],
): string {
  if (seat === view.me) return "You";
  const name = names[seat];
  if (name) return name;
  const p = view.players[seat];
  return p ? vampireName(p.vampire) : `Seat ${seat + 1}`;
}

export const EFFECT_LABEL: Record<SpaceEffect, string> = {
  none: "Path",
  castle: "Castle",
  cemetery: "Cemetery",
  chest: "Chest",
  "chest-open": "Open chest",
  crypt: "Crypt",
  labyrinth: "Labyrinth",
  market: "Market",
  church: "Church",
  mansion: "Mansion",
  barracks: "Barracks",
  ship: "Ship",
  tavern: "Tavern",
  well: "Well",
};

export const EFFECT_GLYPH: Record<SpaceEffect, string> = {
  none: "",
  castle: "🏰",
  cemetery: "⚰",
  chest: "🗝",
  "chest-open": "🗝",
  crypt: "📜",
  labyrinth: "🌹",
  market: "🧺",
  church: "⛪",
  mansion: "🏛",
  barracks: "⚔",
  ship: "⛵",
  tavern: "🍺",
  well: "◎",
};

export const CATEGORY_LABEL: Record<HumanCategory, string> = {
  villager: "Villager",
  religious: "Religious",
  military: "Military",
  noble: "Noble",
};

export const CATEGORY_GLYPH: Record<HumanCategory, string> = {
  villager: "🌾",
  religious: "✝",
  military: "⚔",
  noble: "👑",
};

const PATH_NAME = { road: "Road", rail: "Railroad", boat: "Boat" } as const;

/**
 * A space as a player names it: the region and what is there ("Forest
 * Well", "Plains Crypt"), or the region and its path for a plain space
 * ("Plains Railroad"). Space ids are internal and never shown.
 */
export function spaceLabel(options: Pick<GameOptions, "board">, id: string): string {
  const s = graphFor(options).spaces.get(id);
  if (!s) return "a space";
  if (s.effect === "castle" || s.effect === "labyrinth") return EFFECT_LABEL[s.effect];
  if (s.region === "cemetery") return "Cemetery";
  const region = s.region[0].toUpperCase() + s.region.slice(1);
  if (s.effect !== "none" && s.effect !== "cemetery") return `${region} ${EFFECT_LABEL[s.effect]}`;
  return s.path ? `${region} ${PATH_NAME[s.path]}` : region;
}
