// Shared fixtures for the Sensō test suite (not a test file itself).
import { createRng } from "../../lib/rng";
import { initialSupply } from "./board";
import { applyAction, createInitialState, settleTrick } from "./game-engine";
import { getLegalActions } from "./rules";
import type { AIStrategyId, Board, Clan, GameState } from "./types";

const LETTER: Record<string, Clan> = { t: "takeda", u: "uesugi", o: "oda", m: "mori" };

/** `["mm.", "u.", …]` → board; one string per region, top square first, "." = empty. */
export function boardFromLetters(rows: readonly string[]): Board {
  return rows.map((row) =>
    [...row].map((ch) => {
      if (ch === ".") return null;
      const clan = LETTER[ch];
      if (!clan) throw new Error(`Unknown clan letter "${ch}"`);
      return clan;
    }),
  );
}

export function lettersFromBoard(board: Board): string[] {
  return board.map((squares) => squares.map((c) => (c ? c[0] : ".")).join(""));
}

export function baseState(
  playerCount: number,
  seed = 1,
  strategies?: (AIStrategyId | null)[],
): GameState {
  return createInitialState(
    playerCount,
    strategies ?? Array.from({ length: playerCount }, () => null),
    seed,
  );
}

/** Pin the seat → faction assignment (null = Emperor) and recompute the supply. */
export function setFactions(state: GameState, factions: (Clan | null)[]): GameState {
  if (factions.length !== state.players.length) throw new Error("faction count mismatch");
  state.players.forEach((p, i) => {
    p.clan = factions[i];
  });
  state.emperorSeat = factions.indexOf(null) === -1 ? null : factions.indexOf(null);
  state.seatedClans = factions.filter((c): c is Clan => c !== null);
  state.supply = initialSupply(state.seatedClans, state.board);
  return state;
}

export function setBoard(state: GameState, rows: readonly string[]): GameState {
  state.board = boardFromLetters(rows);
  state.supply = initialSupply(state.seatedClans, state.board);
  return state;
}

export const EMPTY_ROWS = ["...", "..", "..", ".", "...", "..", "...", ".", "...", "..."];

/** Play random cards until at most `cardsLeft` plies remain in the round (seeded). */
export function midRound(players: number, seed: number, cardsLeft: number): GameState {
  const state = createInitialState(players, Array(players).fill(null), seed);
  const rng = createRng(seed);
  for (;;) {
    if (state.phase === "trick-settle") {
      settleTrick(state);
      continue;
    }
    const left = state.players.reduce((n, p) => n + p.hand.length, 0);
    if (left <= cardsLeft) break;
    const legal = getLegalActions(state);
    applyAction(state, legal[Math.floor(rng() * legal.length)]);
  }
  return state;
}
