/**
 * A position, drawn once and never touched: the board's own squares and piece
 * art in one SVG, scaling to its box. For thumbnails and previews, where the
 * interactive `ChessBoard` (drag, keyboard, arrows) would be dozens of times
 * the weight. `lastMove` tints the move's two squares, as the board does.
 */
import { parseFen } from "@boardgames/core/games/chess/engine/fen";
import type { Color } from "@boardgames/core/games/chess/engine/types";
import { useMemo } from "react";
import { cn } from "../../../../lib/cn";
import { BOARD_COLORS } from "./palette";
import { PIECE_URL } from "./pieces";

const FILES = "abcdefgh";

export function MiniBoard({
  fen,
  orientation = "w",
  lastMove = null,
  className,
  label,
}: {
  fen: string;
  orientation?: Color;
  lastMove?: string | null;
  className?: string;
  /** What the position is, for screen readers. */
  label: string;
}) {
  const pieces = useMemo(() => {
    const board = parseFen(fen).board;
    return board.flatMap((piece, sq) => (piece ? [{ sq, piece }] : []));
  }, [fen]);
  const lit = useMemo(() => {
    if (!lastMove) return new Set<number>();
    const sq = (s: string) => (Number(s[1]) - 1) * 8 + FILES.indexOf(s[0] ?? "a");
    return new Set([sq(lastMove.slice(0, 2)), sq(lastMove.slice(2, 4))]);
  }, [lastMove]);
  // Square index 0 = a1. Drawn with White at the bottom unless flipped.
  const at = (sq: number) => {
    const file = sq % 8;
    const rank = Math.floor(sq / 8);
    return orientation === "w" ? { x: file, y: 7 - rank } : { x: 7 - file, y: rank };
  };
  return (
    <svg
      viewBox="0 0 8 8"
      role="img"
      aria-label={label}
      className={cn("block aspect-square w-full overflow-hidden rounded-card-md", className)}
    >
      {Array.from({ length: 64 }, (_, sq) => {
        const { x, y } = at(sq);
        const light = (Math.floor(sq / 8) + (sq % 8)) % 2 === 1;
        return (
          <rect
            // biome-ignore lint/suspicious/noArrayIndexKey: the 64 squares, fixed.
            key={sq}
            x={x}
            y={y}
            width={1}
            height={1}
            fill={light ? BOARD_COLORS.light : BOARD_COLORS.dark}
          />
        );
      })}
      {[...lit].map((sq) => {
        const { x, y } = at(sq);
        return (
          <rect key={`lit-${sq}`} x={x} y={y} width={1} height={1} fill={BOARD_COLORS.lastMove} />
        );
      })}
      {pieces.map(({ sq, piece }) => {
        const { x, y } = at(sq);
        return <image key={sq} href={PIECE_URL[piece]} x={x} y={y} width={1} height={1} />;
      })}
    </svg>
  );
}
