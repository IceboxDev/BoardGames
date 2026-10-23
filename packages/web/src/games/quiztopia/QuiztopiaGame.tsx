import type {
  QuiztopiaAction,
  QuiztopiaPlayerView,
  QuiztopiaResult,
} from "@boardgames/core/games/quiztopia/types";
import { useCallback } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { BoardFallback } from "../../components/RouteFallback";
import { useGameShell } from "../../hooks/useGameShell";
import { useSessionFlow } from "../../hooks/useSessionFlow";
import { TRAINER_BASE } from "../../trainers/quiz/paths";
import type { GameComponentProps } from "../types";
import QuiztopiaBoard from "./components/board/QuiztopiaBoard";
import QuiztopiaGameOver from "./components/game-over/QuiztopiaGameOver";

/**
 * Quiztopia's two surfaces:
 *   - Solo "Trainer" — the platform's quiz trainer (`/trainer/quiz`), where
 *     Quiztopia's questions are studied beside every other quiz game's.
 *   - Multiplayer — the server-authoritative co-op referee room.
 *
 * The machine's `getActivePlayer` is −1 while playing (help cards, tip flips
 * and penalties are any-seat actions), so nothing here reads `isMyTurn` or
 * `isAiThinking`: the board keys off `view.you === view.activeSeat` and
 * offers only what `legalActions` lists.
 */
export default function QuiztopiaGame({ source }: GameComponentProps) {
  if (source === "solo") return <Navigate to={TRAINER_BASE} replace />;
  return <QuiztopiaRoom />;
}

function QuiztopiaRoom() {
  const navigate = useNavigate();
  const flow = useSessionFlow<QuiztopiaPlayerView, QuiztopiaAction, QuiztopiaResult | null>("mp");
  const { backToMenu } = flow;
  const { mp } = useGameShell();

  const openTrainer = useCallback(() => {
    backToMenu();
    navigate(TRAINER_BASE);
  }, [backToMenu, navigate]);

  if (flow.phase === "finished" && flow.result) {
    return (
      <QuiztopiaGameOver
        result={flow.result}
        view={flow.view}
        seatNames={flow.seatNames}
        onBackToMenu={backToMenu}
        onOpenTrainer={openTrainer}
        onLeave={mp.reset}
      />
    );
  }

  if (!flow.view) return <BoardFallback />;
  return (
    <QuiztopiaBoard
      view={flow.view}
      legalActions={flow.legalActions}
      seatNames={flow.seatNames}
      send={flow.sendAction}
    />
  );
}
