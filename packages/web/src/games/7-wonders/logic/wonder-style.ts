import type { WonderId } from "@boardgames/core/games/7-wonders/types";

/**
 * Each wonder's look on the board: a two-stop palette, an accent for its
 * title and built stages, and a silhouette (one SVG path on a 100 × 64
 * canvas, standing on the bottom edge) drawn on its board and medallion.
 */
export interface WonderStyle {
  /** Short name for tight spots ("Giza"). */
  short: string;
  from: string;
  to: string;
  accent: string;
  silhouette: string;
}

const STYLES: Record<WonderId, WonderStyle> = {
  giza: {
    short: "Giza",
    from: "#c99a52",
    to: "#4a3214",
    accent: "#f6d89a",
    silhouette: "M2 64 34 22 66 64Z M48 64 70 34 92 64Z M70 64 84 46 98 64Z",
  },
  babylon: {
    short: "Babylon",
    from: "#3f8a5e",
    to: "#132a1f",
    accent: "#b5ebc4",
    silhouette:
      "M10 64V52h80v12Z M18 52V41h64v11Z M26 41V30h48v11Z M34 30V20h32v10Z M42 20v-7h16v7Z M14 52c-4-6 0-10 4-8M86 52c4-6 0-10-4-8M22 41c-4-5 0-9 4-7M78 41c4-5 0-9-4-7M30 30c-3-5 1-8 4-6M70 30c3-5-1-8-4-6",
  },
  olympia: {
    short: "Olympia",
    from: "#7484ad",
    to: "#1f2540",
    accent: "#dbe3fa",
    silhouette:
      "M14 64v-4h72v4Z M18 60V30h64v30Z M12 30l38-18 38 18Z M38 58V44c0-6 3-10 7-10h10c4 0 7 4 7 10v14Z M46 34a4 4 0 1 1 8 0 4 4 0 0 1-8 0Z",
  },
  rhodes: {
    short: "Rhodes",
    from: "#b9813f",
    to: "#1d3550",
    accent: "#ffd28a",
    silhouette:
      "M22 64 40 40 44 24h12l4 16 18 24h-8L56 44h-12L30 64Z M44 24a6 6 0 1 1 12 0Z M56 26 66 8l3 2-9 18Z M64 4a4 5 0 1 1 6 1Z M0 64h100v-4H0Z",
  },
  ephesos: {
    short: "Ephesos",
    from: "#b0807a",
    to: "#3a2229",
    accent: "#ffd9cf",
    silhouette:
      "M6 64v-5h88v5Z M10 59v-3h80v3Z M14 56V30h4v26Zm10 0V30h4v26Zm10 0V30h4v26Zm10 0V30h4v26Zm10 0V30h4v26Zm10 0V30h4v26Zm10 0V30h4v26Z M10 30v-4h80v4Z M8 26 50 8l42 18Z",
  },
  alexandria: {
    short: "Alexandria",
    from: "#2f78aa",
    to: "#0e2238",
    accent: "#a9dcfa",
    silhouette:
      "M30 64V50h40v14Z M36 50 39 26h22l3 24Z M41 26l2-12h14l2 12Z M45 14v-4h10v4Z M50 0c4 4 5 7 0 10-5-3-4-6 0-10Z M0 64c10-4 20-4 30 0M70 64c10-4 20-4 30 0",
  },
  halikarnassos: {
    short: "Halikarnassos",
    from: "#7d5c9c",
    to: "#22172f",
    accent: "#e1cbf6",
    silhouette:
      "M14 64V46h72v18Z M20 46V34h3v12Zm9 0V34h3v12Zm9 0V34h3v12Zm9 0V34h3v12Zm9 0V34h3v12Zm9 0V34h3v12Zm9 0V34h3v12Z M16 34v-3h68v3Z M22 31l28-17 28 17Z M44 14h12l-2-6h-8Z",
  },
};

export function wonderStyle(id: WonderId): WonderStyle {
  return STYLES[id];
}

/** The board's backdrop: the wonder's light from above, its palette below. */
export function wonderBackdrop(id: WonderId): string {
  const s = STYLES[id];
  return `radial-gradient(ellipse 80% 90% at 30% 0%, ${s.from}cc, transparent 70%), linear-gradient(160deg, ${s.from} 0%, ${s.to} 85%)`;
}

/** An age's tint (card backs, the age gauge). */
export const AGE_TINT: Record<1 | 2 | 3, { from: string; to: string; ink: string }> = {
  1: { from: "#a7743a", to: "#3b2410", ink: "#f6d89a" },
  2: { from: "#5b78a6", to: "#1a2640", ink: "#cfe0ff" },
  3: { from: "#8a5bb3", to: "#26153a", ink: "#ead6ff" },
};
