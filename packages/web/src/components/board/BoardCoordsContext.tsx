import { createContext, type ReactNode, useMemo } from "react";
import type { BoardPoint, BoardViewBox } from "./types";

export interface BoardSlotFillIds {
  pilot: string;
  copilot: string;
  mixed: string;
}

export interface BoardCoordsValue {
  viewBox: BoardViewBox;
  /** Screen size of the surface in CSS pixels (null until ResizeObserver fires). */
  surfaceSize: { width: number; height: number } | null;
  /** Convert a logical viewBox point to a screen-pixel offset within the surface. */
  toScreen: (p: BoardPoint) => BoardPoint;
  /** Convert a screen-pixel offset (relative to the surface) back to a viewBox point. */
  toLocal: (p: BoardPoint) => BoardPoint;
  /** Per-surface IDs for the shared slot-fill gradients. Used by <BoardSlot>. */
  slotFillIds: BoardSlotFillIds;
}

// Exported for the sibling `use-board-coords.ts` hook only. Consumers should
// always go through `useBoardCoords()`, not the raw context.
// biome-ignore lint/style/useComponentExportOnlyModules: the consuming hook lives next door.
export const BoardCoordsContext = createContext<BoardCoordsValue | null>(null);

interface ProviderProps {
  viewBox: BoardViewBox;
  surfaceSize: { width: number; height: number } | null;
  slotFillIds: BoardSlotFillIds;
  children: ReactNode;
}

export function BoardCoordsProvider({
  viewBox,
  surfaceSize,
  slotFillIds,
  children,
}: ProviderProps) {
  const value = useMemo<BoardCoordsValue>(() => {
    // preserveAspectRatio="xMidYMid meet" — the actual draw rect is a centred,
    // letterboxed fit of viewBox inside surfaceSize. Compute scale + offset
    // once so toScreen/toLocal don't re-derive it on every call.
    const scale = surfaceSize
      ? Math.min(surfaceSize.width / viewBox.width, surfaceSize.height / viewBox.height)
      : 0;
    const drawW = viewBox.width * scale;
    const drawH = viewBox.height * scale;
    const offX = surfaceSize ? (surfaceSize.width - drawW) / 2 : 0;
    const offY = surfaceSize ? (surfaceSize.height - drawH) / 2 : 0;
    return {
      viewBox,
      surfaceSize,
      slotFillIds,
      toScreen(p) {
        return {
          x: offX + (p.x - viewBox.x) * scale,
          y: offY + (p.y - viewBox.y) * scale,
        };
      },
      toLocal(p) {
        if (!surfaceSize) return { x: 0, y: 0 };
        return {
          x: viewBox.x + (p.x - offX) / scale,
          y: viewBox.y + (p.y - offY) / scale,
        };
      },
    };
  }, [viewBox, surfaceSize, slotFillIds]);

  return <BoardCoordsContext.Provider value={value}>{children}</BoardCoordsContext.Provider>;
}
