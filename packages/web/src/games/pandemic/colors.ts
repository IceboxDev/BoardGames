import type { DiseaseColor } from "@boardgames/core/games/pandemic/types";

/**
 * CSS color strings per disease, used everywhere a cube / city dot / track
 * indicator needs to be tinted. Centralized so a palette change touches
 * one file. Keep contrast with the Pandemic map (dark blues/teals) in mind.
 */
export const DISEASE_FILL: Record<DiseaseColor, string> = {
  blue: "#4488ff",
  yellow: "#ffcc00",
  black: "#1a1a1a",
  red: "#ff3333",
};

export const DISEASE_STROKE: Record<DiseaseColor, string> = {
  blue: "#1d4ed8",
  yellow: "#a16207",
  black: "#0a0a0a",
  red: "#991b1b",
};

/**
 * Lighter accent used for the city-color dot in cards / chips where a
 * solid `DISEASE_FILL` would read as a cube. Slightly desaturated so the
 * cube and the dot stay visually distinct.
 */
export const DISEASE_ACCENT: Record<DiseaseColor, string> = {
  blue: "#60a5fa",
  yellow: "#fbbf24",
  black: "#525252",
  red: "#f87171",
};
