import type { Clan, NinjaId } from "@boardgames/core/games/senso-battle-for-japan/types";

/**
 * Colour strings for everything painted in SVG or via `style` — cubes, card
 * bands, map paper. Centralised so a palette change touches one file. Never
 * put these in Tailwind class strings; chrome there stays in tokens.
 */
export const CLAN_FILL: Record<Clan, string> = {
  takeda: "#c0392b",
  uesugi: "#2e6fd1",
  oda: "#e0b322",
  mori: "#f2ede4",
};

export const CLAN_STROKE: Record<Clan, string> = {
  takeda: "#7a1f15",
  uesugi: "#1b407f",
  oda: "#8a6a0a",
  mori: "#7d7466",
};

/** Ink on top of `CLAN_FILL`. */
export const CLAN_INK: Record<Clan, string> = {
  takeda: "#fff5f2",
  uesugi: "#eef4ff",
  oda: "#2b2200",
  mori: "#2a251c",
};

/** Clan-tinted text on the dark app surface. */
export const CLAN_ACCENT: Record<Clan, string> = {
  takeda: "#f87171",
  uesugi: "#7cb2ff",
  oda: "#fcd34d",
  mori: "#f5f5f4",
};

export const NINJA_FILL: Record<NinjaId, string> = {
  "ninja-wood": "#6b4f2a",
  "ninja-jade": "#1f7a4d",
};
export const NINJA_INK = "#f7f2e8";

export const EMPEROR_GOLD = "#d4a72c";

export const CARD_PAPER = "#f4ecd8";
export const CARD_PAPER_EDGE = "#c9b98f";
export const CARD_BACK = "linear-gradient(160deg, #4a1216 0%, #23070a 100%)";
export const CARD_BACK_MON = "#c9a24d";

/**
 * The composed card face (`components/card/`). Ink for the corner rank and
 * the clan rule on cream paper — `CLAN_FILL.mori` is paper-white and would
 * vanish there, so every clan gets a printing ink of its own.
 */
export const CLAN_INDEX_INK: Record<Clan, string> = {
  takeda: "#a3291c",
  uesugi: "#1f56b0",
  oda: "#8a6a0a",
  mori: "#2a251c",
};
/** The darker paper of the hanging ribbon. */
export const CARD_PAPER_DARK = "#e6dcc0";
export const CARD_INK = "#2b2418";
export const CARD_HAIRLINE = "rgba(43, 36, 24, 0.35)";
export const SEAL_RED = "#d9442b";
export const GOLD_LEAF = CARD_BACK_MON;
/** A tint over the paper so a Ninja reads as "no clan" even without its art. */
export const NINJA_WASH: Record<NinjaId, string> = {
  "ninja-wood": "rgba(107, 79, 42, 0.16)",
  "ninja-jade": "rgba(31, 122, 77, 0.16)",
};
/** Paper under a corner index that sits on full-bleed art. */
export const INDEX_BACKING = "rgba(244, 236, 216, 0.85)";
export const ACE_HALO_FALLBACK =
  "radial-gradient(circle, rgba(201, 162, 77, 0.55) 0%, rgba(201, 162, 77, 0.25) 45%, rgba(201, 162, 77, 0) 70%)";

export const MAP_PAPER = "#f1e8d2";
export const MAP_PAPER_EDGE = "#6f5f43";
export const MAP_INK = "#2b2418";
export const MAP_INK_FAINT = "rgba(43, 36, 24, 0.3)";
export const MAP_SQUARE_FILL = "rgba(255, 255, 255, 0.35)";
export const MAP_SQUARE_STROKE = "rgba(43, 36, 24, 0.35)";
/** The flat shadow that lifts a region card off the painting. */
export const MAP_CARD_SHADOW = "rgba(20, 14, 6, 0.4)";
/** The adjacency routes across the painting: a pale halo under an inked dash. */
export const MAP_ROUTE_HALO = "rgba(241, 232, 210, 0.55)";
export const MAP_ROUTE_INK = "#3a2f1d";

/**
 * The conflict table: aizome (indigo-dyed) cloth on a dark lacquered rim.
 * Indigo rather than lacquer red on purpose — the card backs and Takeda are
 * crimson and would sink into a red cloth; on indigo the amber trump glow,
 * the gold First Player token, the paper plates and the emerald winner ring
 * all separate.
 */
export const TABLE_FELT = "#1c2944";
export const TABLE_FELT_CENTRE = "#243657";
export const TABLE_FELT_EDGE = "#0f172b";
export const TABLE_FELT_VIGNETTE = `radial-gradient(ellipse at 50% 42%, ${TABLE_FELT_CENTRE} 0%, ${TABLE_FELT} 58%, ${TABLE_FELT_EDGE} 100%)`;
export const TABLE_FELT_INSET = "inset 0 0 60px rgba(0, 0, 0, 0.45)";
export const TABLE_RIM = "linear-gradient(180deg, #5b3a24 0%, #3a2418 45%, #22140c 100%)";
export const TABLE_RIM_EDGE = "#1a0e08";
export const TABLE_SHADOW =
  "0 24px 60px rgba(0, 0, 0, 0.55), inset 0 2px 0 rgba(255, 233, 200, 0.18)";
export const TABLE_PLATE = MAP_PAPER;
export const TABLE_PLATE_EDGE = MAP_PAPER_EDGE;
export const TABLE_PLATE_INK = MAP_INK;
/** An empty slot is a chalk line: ink is invisible on the cloth, paper is not. */
export const TABLE_SLOT_STROKE = "rgba(241, 232, 210, 0.35)";
export const TABLE_SLOT_FILL = "rgba(241, 232, 210, 0.04)";

export const AFFECTED_FILL = "#0b0b0b";
export const AFFECTED_STROKE = "#f4ecd8";

/** Legal-target rings on the map. */
export const HIGHLIGHT = {
  source: "#facc15",
  swap: "#38bdf8",
  place: "#34d399",
  strike: "#fb7185",
} as const;

export type HighlightKind = keyof typeof HIGHLIGHT;

export function factionColor(clan: Clan | null): string {
  return clan === null ? EMPEROR_GOLD : CLAN_ACCENT[clan];
}
