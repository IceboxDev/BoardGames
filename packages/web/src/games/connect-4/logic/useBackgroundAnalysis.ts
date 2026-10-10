import { boardAfter, other } from "@boardgames/core/games/connect-4/rules";
import type { PositionInput } from "@boardgames/core/games/connect-4/solver/analysis";
import type { Connect4PlayerView } from "@boardgames/core/games/connect-4/types";
import { useEffect } from "react";
import { solverClient } from "./solver-client";

/**
 * While a game is played, grade its moves and solve each position's columns
 * in the background (behind anything on screen), so its analysis is ready the
 * moment it ends. Nothing is shown during play — assists stay what the table
 * chose. PopOut isn't solved, so it's left alone.
 */
export function useBackgroundAnalysis(view: Connect4PlayerView): void {
  const { cols, rows, moves, firstPlayer, phase } = view;
  const popOut = view.config.popOut;
  useEffect(() => {
    if (popOut || moves.some((m) => m.type !== "drop")) return;
    // Every position so far but a finished one (nothing is left to play there).
    const last = phase === "playing" ? moves.length : moves.length - 1;
    const positions: PositionInput[] = [];
    for (let ply = 0; ply <= last; ply++) {
      const prefix = moves.slice(0, ply);
      const toMove = ply === 0 ? firstPlayer : other(moves[ply - 1].player);
      positions.push({ cols, rows, popOut: false, board: boardAfter(cols, rows, prefix), toMove });
    }
    solverClient.prefetchGame({ cols, rows, moves }, positions);
  }, [cols, rows, moves, firstPlayer, phase, popOut]);
}
