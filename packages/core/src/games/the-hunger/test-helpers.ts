import { applyActionPure, createInitialState, startTurn } from "./game-engine";
import { getActivePlayer, getLegalActions } from "./rules";
import type { Action, GameOptions, GameState } from "./types";

/** A seeded game with the setup Mission picks done; every seat holds Royal. */
export function afterSetup(playerCount = 2, seed = 7, options?: Partial<GameOptions>): GameState {
  let state = createInitialState({
    playerCount,
    strategies: Array(playerCount).fill(null),
    seed,
    options,
    board: "test",
  });
  while (state.phase === "setup") {
    const seat = state.current?.player ?? 0;
    state = applyActionPure(state, seat, getLegalActions(state, seat)[0]);
  }
  // A fixed, standard starting Mission, so no shuffle can hand a seat an
  // Instant that changes which choices a rigged turn offers.
  for (const p of state.players) p.missions = ["royal"];
  return state;
}

/**
 * Rig `seat`'s next turn: its hand, position and (optionally) the Hunt Track,
 * then start the turn. Other Vampires are parked in the Castle's stack.
 */
export function rigTurn(
  base: GameState,
  seat: number,
  rig: { hand: string[]; pos: string; track?: string[][][]; permanent?: string[] },
): GameState {
  const state = structuredClone(base);
  const p = state.players[seat];
  p.hand = [...rig.hand];
  p.playArea = (rig.permanent ?? []).map((id) => ({ id, resolved: false }));
  p.pos = rig.pos;
  p.castleTile = null;
  if (rig.track) state.track = rig.track;
  state.order = [];
  startTurn(state, seat);
  return state;
}

/** Act as whoever decides now (a pushed Vampire answering a Nanny, usually the turn's). */
export function act(state: GameState, action: Action): GameState {
  return applyActionPure(state, getActivePlayer(state), action);
}

export function legal(state: GameState): Action[] {
  return getLegalActions(state, getActivePlayer(state));
}

export const emptyTrack = (rows = 3): string[][][] =>
  Array.from({ length: rows }, () => [[], [], []]);
