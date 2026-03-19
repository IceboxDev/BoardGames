import type {
  LostCitiesPlayerView,
  LostCitiesResult,
} from "@boardgames/core/games/lost-cities/machine";
import type { AIEngine, DrawAction, PlayAction } from "@boardgames/core/games/lost-cities/types";
import { useGameSession } from "./ws-client";

export type LostCitiesAction =
  | { phase: "play"; action: PlayAction }
  | { phase: "draw"; action: DrawAction };

export function useLostCitiesSession() {
  const session = useGameSession<LostCitiesPlayerView, LostCitiesAction, LostCitiesResult>();

  return {
    ...session,
    startGame(aiEngine: AIEngine) {
      session.createSession("lost-cities", { aiEngine });
    },
    playCard(action: PlayAction) {
      session.sendAction({ phase: "play", action });
    },
    drawCard(action: DrawAction) {
      session.sendAction({ phase: "draw", action });
    },
  };
}
