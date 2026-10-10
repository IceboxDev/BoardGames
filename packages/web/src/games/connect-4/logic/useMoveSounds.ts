import type { Connect4PlayerView } from "@boardgames/core/games/connect-4/types";
import { useEffect, useRef } from "react";
import { fallSeconds } from "../components/board/motion";
import { playSound } from "./sound";

/**
 * A clack as each new disc lands (timed to its fall), a rattle per pop, a
 * chime when a four completes. Silent while `muted`, and for anything that
 * isn't one new move (a new game's empty board, a replay jumping back).
 */
export function useMoveSounds(view: Connect4PlayerView, muted: boolean): void {
  const ply = view.moves.length;
  const ended = view.winningCells.length > 0;
  const seen = useRef({ game: view.gameIndex, ply, ended });

  useEffect(() => {
    const prev = seen.current;
    seen.current = { game: view.gameIndex, ply, ended };
    if (muted || view.gameIndex !== prev.game) return;
    if (ply === prev.ply + 1) {
      const move = view.moves[ply - 1];
      if (move?.type === "pop") playSound("pop");
      else if (move) playSound("drop", fallSeconds(view.rows - move.row));
    }
    if (ended && !prev.ended) playSound("win");
  }, [view.gameIndex, view.moves, view.rows, ply, ended, muted]);
}
