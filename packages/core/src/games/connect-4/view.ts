import type { Connect4PlayerView, GameState } from "./types";

/**
 * What every seat sees — Connect 4 has no hidden information, so it is the
 * whole state minus the bookkeeping (seed, repetition counts). The one view
 * builder: the live game and the replay both go through it.
 */
export function buildPlayerView(gs: GameState): Connect4PlayerView {
  return {
    config: gs.config,
    cols: gs.cols,
    rows: gs.rows,
    phase: gs.phase,
    gameIndex: gs.gameIndex,
    board: gs.board,
    currentPlayer: gs.currentPlayer,
    firstPlayer: gs.firstPlayer,
    moves: gs.moves,
    winningCells: gs.winningCells,
    wins: gs.wins,
    games: gs.games,
    seriesWinner: gs.seriesWinner,
    strategies: gs.strategies,
  };
}
