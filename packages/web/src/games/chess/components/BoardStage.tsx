import type { ReactNode } from "react";
import { useMediaQuery, WIDE_BOARD_QUERY } from "../../../hooks/useMediaQuery";
import { useSquareFit } from "../logic/board-view";

/** Room for the two player strips (name + captured row + clock) and their gaps. */
const STRIPS_H = 2 * 48 + 8;
/**
 * Kept free beside the board on wide screens, whether or not the review's
 * eval bar is there: the live board and its review are the same size and in
 * the same place (the bar sits in this margin, out of the layout).
 */
const EVAL_BAR_ROOM = 2 * 36;

/**
 * The board between its two player strips, sized to the space — shared by
 * the live game and its review, so the board never moves when a game ends.
 * `beside` (the eval bar, wide screens) hangs left of the board; `under`
 * (the review's move card, phones) follows the bottom strip.
 */
export function BoardStage({
  top,
  bottom,
  overlay,
  beside,
  under,
  children,
}: {
  top: ReactNode;
  bottom: ReactNode;
  /** Over the board (the live game's browse chip). */
  overlay?: ReactNode;
  beside?: (size: number) => ReactNode;
  under?: ReactNode;
  children: (size: number) => ReactNode;
}) {
  const wide = useMediaQuery(WIDE_BOARD_QUERY);
  const [fitRef, size] = useSquareFit<HTMLDivElement>(wide ? EVAL_BAR_ROOM : 0, STRIPS_H);
  return (
    <div ref={fitRef} className="flex min-h-0 flex-1 items-center justify-center">
      {/* Strips and board are one block, so the names and clocks stay against
          the board's edges at every width. */}
      <div className="flex flex-col gap-1" style={{ width: size }}>
        {top}
        <div className="relative" style={{ width: size, height: size }}>
          {wide && beside && size > 0 && (
            <div className="absolute top-0 right-full mr-2 h-full">{beside(size)}</div>
          )}
          {overlay}
          {size > 0 && children(size)}
        </div>
        {bottom}
        {!wide && under}
      </div>
    </div>
  );
}
