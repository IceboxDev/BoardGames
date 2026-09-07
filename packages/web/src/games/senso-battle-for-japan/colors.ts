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

export const MAP_PAPER = "#f1e8d2";
export const MAP_PAPER_EDGE = "#8b7b5e";
export const MAP_INK = "#2b2418";
export const MAP_INK_FAINT = "rgba(43, 36, 24, 0.3)";
export const MAP_EDGE_STROKE = "#8b7b5e";
export const MAP_SQUARE_FILL = "rgba(255, 255, 255, 0.35)";
export const MAP_SQUARE_STROKE = "rgba(43, 36, 24, 0.35)";

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
