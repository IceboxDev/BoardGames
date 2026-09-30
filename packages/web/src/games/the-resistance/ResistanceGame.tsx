import type {
  ResistanceAction,
  ResistancePlayerView,
  ResistanceResult,
} from "@boardgames/core/games/the-resistance/types";
import { BoardFallback } from "../../components/RouteFallback";
import { useSessionFlow } from "../../hooks/useSessionFlow";
import type { GameComponentProps } from "../types";
import { ResistanceBoard } from "./components/board/ResistanceBoard";
import { GameOver } from "./components/GameOver";
import SolverRoutes from "./components/solver/SolverRoutes";

/**
 * The Resistance: solo = the Solver (`/play/the-resistance/solo/*`), rooms =
 * the online game for 5–10, bots filling empty seats.
 */
export default function ResistanceGame({ source }: GameComponentProps) {
  if (source === "solo") return <SolverRoutes />;
  return <RoomGame />;
}

function RoomGame() {
  const flow = useSessionFlow<ResistancePlayerView | null, ResistanceAction, ResistanceResult>(
    "mp",
  );
  const view = flow.view;
  if (!view) return <BoardFallback />;

  if (flow.phase === "finished") {
    return (
      <GameOver view={view} result={flow.result} names={flow.seatNames} actions={flow.endActions} />
    );
  }

  return (
    <ResistanceBoard
      view={view}
      legalActions={flow.legalActions}
      names={flow.seatNames}
      isAiThinking={flow.isAiThinking}
      onAction={flow.sendAction}
    />
  );
}
