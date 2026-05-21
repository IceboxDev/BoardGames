import { type KeyboardEvent, useCallback } from "react";

type Direction = "up" | "down" | "left" | "right";

export type ArrowAdjacency<K extends string> = Partial<Record<K, Partial<Record<Direction, K>>>>;

/**
 * Hook helper for arrow-key navigation across a discrete slot grid.
 *
 * `adjacency[slotId][direction] = neighbourId` maps each cell to its
 * neighbour in a given direction. Pass the returned handler to a wrapper
 * element; it dispatches focus to a `data-slot-id="…"` element under the
 * wrapper when an arrow key is pressed.
 *
 * For irregular cockpit layouts the adjacency map is hand-written. For pure
 * grids, build it once from row/col coordinates.
 */
export function useArrowKeyNavigation<K extends string>(adjacency: ArrowAdjacency<K>) {
  return useCallback(
    (e: KeyboardEvent<HTMLElement | SVGElement>) => {
      const dir = arrowKeyDirection(e.key);
      if (!dir) return;
      const target = e.target as Element | null;
      const currentId = target?.closest<HTMLElement | SVGElement>("[data-slot-id]")?.dataset.slotId;
      if (!currentId) return;
      const next = adjacency[currentId as K]?.[dir];
      if (!next) return;
      e.preventDefault();
      const root = e.currentTarget;
      const nextEl = root.querySelector<HTMLElement | SVGElement>(
        `[data-slot-id="${CSS.escape(next)}"]`,
      );
      nextEl?.focus();
    },
    [adjacency],
  );
}

function arrowKeyDirection(key: string): Direction | null {
  switch (key) {
    case "ArrowUp":
      return "up";
    case "ArrowDown":
      return "down";
    case "ArrowLeft":
      return "left";
    case "ArrowRight":
      return "right";
    default:
      return null;
  }
}
