import { useContext } from "react";
import { BoardCoordsContext, type BoardCoordsValue } from "./BoardCoordsContext";

/**
 * Read the surrounding <BoardSurface>'s coordinate helpers + surface size.
 * Throws if used outside a <BoardSurface>.
 */
export function useBoardCoords(): BoardCoordsValue {
  const ctx = useContext(BoardCoordsContext);
  if (!ctx) throw new Error("useBoardCoords must be used inside <BoardSurface>");
  return ctx;
}
