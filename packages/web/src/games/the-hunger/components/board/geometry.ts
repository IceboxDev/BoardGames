import type { BoardDef, BoardId, PathKind, Region } from "@boardgames/core/games/the-hunger/types";

/** The board art (`assets/board-a.webp`); side B is the same map. The test layout has none. */
const IMAGES = import.meta.glob<string>("../../assets/board-*.webp", {
  eager: true,
  import: "default",
});

export function boardImage(side: BoardId): string | undefined {
  if (side === "test") return undefined;
  return (
    IMAGES[`../../assets/board-${side.toLowerCase()}.webp`] ?? IMAGES["../../assets/board-a.webp"]
  );
}

/** The map's viewBox: the board file's own pixel space. */
export function viewBoxOf(def: BoardDef) {
  return { x: 0, y: 0, width: def.width, height: def.height };
}

export function aspectOf(def: BoardDef): string {
  return `${def.width} / ${def.height}`;
}

/** Sizes scale with the board so a 1254 px photo and the 1650 px test layout both read. */
export function scaleOf(def: BoardDef): number {
  return def.width / 1650;
}

export const SPACE_R = 30;

export const REGION_FILL: Record<Region, string> = {
  castle: "#3b2a4a",
  cemetery: "#2f3136",
  mountains: "#4a4f5a",
  plains: "#5a5a2e",
  forest: "#1f4a2c",
};

export const PATH_STROKE: Record<PathKind, { color: string; dash?: string }> = {
  road: { color: "#a0724a" },
  rail: { color: "#8c8c96", dash: "14 8" },
  boat: { color: "#4a86c5", dash: "4 8" },
};
