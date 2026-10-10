import { toFen } from "@boardgames/core/games/chess/engine/fen";
import { replayGame } from "@boardgames/core/games/chess/game";
import type { ChessPlayerView } from "@boardgames/core/games/chess/schemas";
import { type RefObject, useEffect, useRef, useState } from "react";

/** Below this much height the space is content-sized, not a limit. */
const MIN_BOARD_PX = 160;

/**
 * The largest square that fits the element — the board is always square.
 * `reserveX` keeps room for something beside it (the eval bar), `reserveY`
 * for what sits above and below it (the player strips).
 */
export function useSquareFit<T extends HTMLElement>(
  reserveX = 0,
  reserveY = 0,
): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      const wide = width - reserveX;
      const tall = height - reserveY;
      // On phones the column is sized by its content (the page scrolls), so a
      // tiny height isn't a limit: fit the width and let the column grow.
      setSize(Math.max(0, Math.floor(tall >= MIN_BOARD_PX ? Math.min(wide, tall) : wide)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [reserveX, reserveY]);
  return [ref, size];
}

/** Board position after `ply` moves (for browsing the game), or `null` when unparseable. */
export function positionAt(view: ChessPlayerView, ply: number): string | null {
  try {
    return toFen(replayGame(view.startFen, view.history.slice(0, ply)).position);
  } catch {
    return null;
  }
}

/** The element's content box, kept current — for layouts that place several boards. */
export function useBox<T extends HTMLElement>(): [
  RefObject<T | null>,
  { width: number; height: number },
] {
  const ref = useRef<T | null>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setBox({ width: Math.floor(width), height: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, box];
}
