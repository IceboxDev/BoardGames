import { useReducer } from "react";
import {
  applyAction,
  applyDrawPhase,
  applyInfectPhase,
  resolveEpidemic,
} from "../logic/game-engine";
import { createGame } from "../logic/setup";
import type { GameAction, GameState, MetaAction, SetupConfig } from "../logic/types";

type DispatchAction = GameAction | MetaAction;

function gameReducer(state: GameState | null, action: DispatchAction): GameState | null {
  if (action.kind === "start_game") {
    return createGame((action as { kind: "start_game"; config: SetupConfig }).config);
  }

  if (action.kind === "reset") {
    return null;
  }

  if (!state) return null;
  if (state.result) return state;

  // Handle the automated phase transitions
  if (action.kind === "animate_complete") {
    switch (state.phase) {
      case "draw":
        return applyDrawPhase(state);
      case "epidemic":
        return resolveEpidemic(state);
      case "infect":
        return applyInfectPhase(state);
      default:
        return state;
    }
  }

  return applyAction(state, action as GameAction);
}

export type GameDispatch = (action: DispatchAction) => void;

export function useGameState(): [GameState | null, GameDispatch] {
  const [state, dispatch] = useReducer(gameReducer, null);
  return [state, dispatch];
}
