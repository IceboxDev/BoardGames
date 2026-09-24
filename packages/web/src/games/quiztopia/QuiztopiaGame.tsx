import type {
  QuiztopiaAction,
  QuiztopiaMachineEvent,
  QuiztopiaPlayerView,
  QuiztopiaResult,
} from "@boardgames/core/games/quiztopia/types";
import { useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useGameShell } from "../../hooks/useGameShell";
import type { GameComponentProps } from "../types";
import QuiztopiaBoard from "./components/board/QuiztopiaBoard";
import QuiztopiaGameOver from "./components/game-over/QuiztopiaGameOver";
import TrainerRoutes from "./components/trainer/TrainerRoutes";
import { seatNamesFromRoom } from "./logic/seats";

/**
 * Quiztopia's two surfaces:
 *   - Solo "Trainer" — the flashcard programme + wiki, nested routes under
 *     `/play/quiztopia/solo/*` (rendered by `<TrainerRoutes>`).
 *   - Multiplayer — the server-authoritative co-op referee room.
 *
 * The machine's `getActivePlayer` is −1 while playing (help cards, tip flips
 * and penalties are any-seat actions), so nothing here reads `mp.isMyTurn`
 * or `isAiThinking`: the board keys off `view.you === view.activeSeat` and
 * offers only what `mp.legalActions` lists.
 */
export default function QuiztopiaGame({ source }: GameComponentProps) {
  const navigate = useNavigate();
  const { def, mp } = useGameShell<
    QuiztopiaPlayerView,
    QuiztopiaMachineEvent,
    QuiztopiaResult | null,
    QuiztopiaAction
  >();

  // The result frame may arrive without a view; keep the last one for the
  // game-over question list and skyline.
  const lastViewRef = useRef<QuiztopiaPlayerView | null>(null);
  if (mp.view) lastViewRef.current = mp.view;

  const backToMenu = useCallback(() => {
    mp.reset();
    navigate(`/play/${def.slug}`);
  }, [mp.reset, def.slug, navigate]);

  const openTrainer = useCallback(() => {
    mp.reset();
    navigate(`/play/${def.slug}/solo`);
  }, [mp.reset, def.slug, navigate]);

  const send = useCallback(
    (action: QuiztopiaAction) => {
      // The server derives the seat from the authenticated socket; `player`
      // is informational.
      mp.send({ type: "PLAYER_ACTION", player: mp.playerIndex ?? 0, action });
    },
    [mp.send, mp.playerIndex],
  );

  const seatNames = useMemo(() => seatNamesFromRoom(mp.roomState), [mp.roomState]);

  if (source === "solo") return <TrainerRoutes />;

  if (mp.result) {
    return (
      <QuiztopiaGameOver
        result={mp.result}
        view={lastViewRef.current}
        seatNames={seatNames}
        roomCode={mp.roomCode}
        onBackToMenu={backToMenu}
        onOpenTrainer={openTrainer}
        onLeave={mp.reset}
      />
    );
  }

  if (mp.view) {
    return (
      <QuiztopiaBoard
        view={mp.view}
        legalActions={mp.legalActions}
        seatNames={seatNames}
        send={send}
      />
    );
  }

  return null;
}
