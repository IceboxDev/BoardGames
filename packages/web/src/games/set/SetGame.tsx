import type { SetPvpAction, SetPvpPlayerView } from "@boardgames/core/games/set/pvp-machine";
import type { PvpGameResult } from "@boardgames/core/games/set/pvp-types";
import { useNavigate } from "react-router-dom";
import { BoardFallback } from "../../components/RouteFallback";
import { useSessionFlow } from "../../hooks/useSessionFlow";
import type { GameComponentProps } from "../types";
import PvpGameBoard from "./components/PvpGameBoard";
import PvpGameOverScreen from "./components/PvpGameOverScreen";
import TrainerGame from "./components/TrainerGame";

/**
 * Set has two distinct playable surfaces:
 *   - Solo "Trainer" — fully client-side speed practice with its own local
 *     history (rendered by `<TrainerGame>`).
 *   - Multiplayer PvP — the server-run race to find sets.
 *
 * The trainer's "View History" navigates to `/play/set/match-history`, which
 * shows the trainer's runs next to the online matches.
 */
export default function SetGame({ source }: GameComponentProps) {
  const navigate = useNavigate();
  if (source === "solo") {
    return <TrainerGame onViewHistory={() => navigate("/play/set/match-history")} />;
  }
  return <SetRoom />;
}

function SetRoom() {
  const flow = useSessionFlow<SetPvpPlayerView, SetPvpAction, PvpGameResult | null>("mp");
  const opponentName = flow.seatNames[1 - flow.seat] ?? `Player ${2 - flow.seat}`;

  if (flow.phase === "finished" && flow.result) {
    return (
      <PvpGameOverScreen
        result={flow.result}
        playerIndex={flow.seat}
        opponentName={opponentName}
        actions={flow.endActions}
      />
    );
  }

  if (!flow.view) return <BoardFallback />;
  return (
    <PvpGameBoard
      view={flow.view}
      playerIndex={flow.seat}
      opponentName={opponentName}
      send={flow.sendAction}
    />
  );
}
