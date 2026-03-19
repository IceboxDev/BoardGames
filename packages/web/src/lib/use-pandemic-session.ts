import type { GameAction, GameResult, GameState } from "@boardgames/core/games/pandemic/types";
import { useGameSession } from "./ws-client";

export function usePandemicSession() {
  const session = useGameSession<GameState, GameAction, GameResult | null>();

  return {
    ...session,
    startGame(numPlayers: 2 | 3 | 4, difficulty: 4 | 5 | 6) {
      session.createSession("pandemic", { numPlayers, difficulty });
    },
    performAction(action: GameAction) {
      session.sendAction(action);
    },
  };
}
