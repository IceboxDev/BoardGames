import type { CodenamesConfig } from "@boardgames/core/games/codenames/manifest";
import type {
  CodenamesAction,
  CodenamesPlayerView,
  CodenamesResult,
} from "@boardgames/core/games/codenames/types";
import type { SeatRequest } from "@boardgames/core/machines/seats";
import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { BoardFallback, RouteFallback } from "../../components/RouteFallback";
import { type SoloStart, useSessionFlow } from "../../hooks/useSessionFlow";
import type { GameComponentProps } from "../types";
import GameBoard from "./components/GameBoard";
import GameOverScreen from "./components/GameOverScreen";
import SetupScreen, { type CodenamesSetup } from "./components/SetupScreen";

/** You on Red (seat 0 spymaster, or seat 2 operative); every other seat AI. */
function toSoloStart({ role, players, modelId, ...options }: CodenamesSetup): SoloStart {
  const mySeat = role === "spymaster" ? 0 : 2;
  const seats: SeatRequest[] = Array.from({ length: players }, (_, seat) =>
    seat === mySeat ? { kind: "human" } : { kind: "ai", strategy: modelId },
  );
  const config: CodenamesConfig = options;
  return { seats, config };
}

const CompanionScreen = lazy(() => import("./companion/CompanionScreen"));

// Singleplayer is the game against the AI (`solo`); the Companion — a photo of
// the table's grid read onto your phone — is `solo/companion`.
export default function Codenames({ source }: GameComponentProps) {
  if (source !== "solo") return <CodenamesGame source={source} />;
  return (
    <Routes>
      <Route index element={<CodenamesGame source="solo" />} />
      <Route
        path="companion"
        element={
          <Suspense fallback={<RouteFallback />}>
            <CompanionScreen />
          </Suspense>
        }
      />
      <Route path="*" element={<Navigate to="/play/codenames/solo" replace />} />
    </Routes>
  );
}

function CodenamesGame({ source }: GameComponentProps) {
  const flow = useSessionFlow<
    CodenamesPlayerView,
    CodenamesAction,
    CodenamesResult,
    CodenamesSetup
  >(source, { toSoloStart });

  if (flow.phase === "setup") return <SetupScreen onStart={flow.start} />;
  if (!flow.view) return <BoardFallback />;

  // Rooms label people by name; AI seats (and solo) by their role.
  const names = flow.seats.map((s) => (source === "mp" && s.kind === "human" ? s.name : null));
  const images = flow.seats.map((s) => s.image);
  if (flow.phase === "finished")
    return (
      <GameOverScreen
        view={flow.view}
        names={names}
        actions={flow.endActions}
        waitingForHost={flow.waitingForHost}
        error={source === "mp" ? flow.error : null}
      />
    );
  return (
    <GameBoard
      view={flow.view}
      names={names}
      images={images}
      onAction={flow.sendAction}
      error={flow.error}
    />
  );
}
