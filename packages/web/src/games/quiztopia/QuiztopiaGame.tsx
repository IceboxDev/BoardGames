import type {
  QuiztopiaAction,
  QuiztopiaPlayerView,
  QuiztopiaResult,
} from "@boardgames/core/games/quiztopia/types";
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { BoardFallback } from "../../components/RouteFallback";
import { useGameShell } from "../../hooks/useGameShell";
import { useSessionFlow } from "../../hooks/useSessionFlow";
import type { GameComponentProps } from "../types";
import QuiztopiaBoard from "./components/board/QuiztopiaBoard";
import QuiztopiaGameOver from "./components/game-over/QuiztopiaGameOver";
import TrainerRoutes from "./components/trainer/TrainerRoutes";

/**
 * Quiztopia's two surfaces:
 *   - Solo "Trainer" — the flashcard programme + wiki, nested routes under
 *     `/play/quiztopia/solo/*` (rendered by `<TrainerRoutes>`).
 *   - Multiplayer — the server-authoritative co-op referee room.
 *
 * The machine's `getActivePlayer` is −1 while playing (help cards, tip flips
 * and penalties are any-seat actions), so nothing here reads `isMyTurn` or
 * `isAiThinking`: the board keys off `view.you === view.activeSeat` and
 * offers only what `legalActions` lists.
 */
export default function QuiztopiaGame({ source }: GameComponentProps) {
  if (source === "solo") return <TrainerRoutes />;
  return <QuiztopiaRoom />;
}

function QuiztopiaRoom() {
  const navigate = useNavigate();
  const flow = useSessionFlow<QuiztopiaPlayerView, QuiztopiaAction, QuiztopiaResult | null>("mp");
  const { backToMenu } = flow;
  // The room code keys the per-question reviews the game-over screen posts.
  const { mp } = useGameShell();

  const openTrainer = useCallback(() => {
    backToMenu();
    navigate("/play/quiztopia/solo");
  }, [backToMenu, navigate]);

  if (flow.phase === "finished" && flow.result) {
    return (
      <QuiztopiaGameOver
        result={flow.result}
        view={flow.view}
        seatNames={flow.seatNames}
        roomCode={mp.roomCode}
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
