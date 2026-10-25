import type { Color } from "@boardgames/core/games/chess/engine/types";
import {
  type ChessAction,
  type ChessPlayerView,
  ChessPlayerViewSchema,
  type ChessResult,
} from "@boardgames/core/games/chess/schemas";
import type { SeatRequest } from "@boardgames/core/machines/seats";
import { lazy, Suspense, useMemo, useState } from "react";
import { Route, Routes } from "react-router-dom";
import { BoardFallback } from "../../components/RouteFallback";
import { type SoloStart, useSessionFlow } from "../../hooks/useSessionFlow";
import type { GameComponentProps } from "../types";
import GameBoard from "./components/GameBoard";
import { PlayFromHere } from "./components/review/PlayFromHere";
import { ReviewBoard } from "./components/review/ReviewBoard";
import SetupScreen, { type ChessSetup } from "./components/SetupScreen";
import { colourSwap } from "./logic/colour-swap";

/** Seat 0 plays White, so "Black" puts the AI first. */
function toSoloStart(setup: ChessSetup): SoloStart {
  const color = setup.color === "random" ? (Math.random() < 0.5 ? "w" : "b") : setup.color;
  const human: SeatRequest = { kind: "human" };
  const ai: SeatRequest = { kind: "ai", strategy: setup.strategy };
  return {
    seats: color === "w" ? [human, ai] : [ai, human],
    config: {
      timeControl: setup.timeControl,
      takebacks: setup.takebacks,
      openingMoves: setup.openingMoves,
    },
  };
}

const ChessTrainer = lazy(() => import("./trainer/ChessTrainer"));

/**
 * Solo routes: the opening trainer at `solo/trainer/*` (the mode picker's
 * Trainer card), a game against Stockfish everywhere else.
 */
export default function Chess({ source }: GameComponentProps) {
  if (source !== "solo") return <ChessGame source={source} />;
  return (
    <Routes>
      <Route
        path="trainer/*"
        element={
          <Suspense fallback={<BoardFallback />}>
            <ChessTrainer />
          </Suspense>
        }
      />
      <Route path="*" element={<ChessGame source="solo" />} />
    </Routes>
  );
}

/**
 * Chess, solo against Stockfish and in rooms. The board only ever offers the
 * moves the server listed; meta actions (offers, takebacks, resign) come from
 * the same list.
 */
function ChessGame({ source }: GameComponentProps) {
  const flow = useSessionFlow<unknown, ChessAction, ChessResult, ChessSetup>(source, {
    toSoloStart,
    soloRematches: colourSwap,
  });

  // The view crosses the wire as `unknown`; parse it rather than trust it.
  const view: ChessPlayerView | null = useMemo(() => {
    if (flow.view === null) return null;
    const parsed = ChessPlayerViewSchema.safeParse(flow.view);
    if (!parsed.success) console.error("[chess] bad view", parsed.error);
    return parsed.success ? parsed.data : null;
  }, [flow.view]);

  // Kept here so the review opens the way up the board was when the game
  // ended. A new game (no view in between) or a new colour (a rematch with
  // colours swapped) starts from the player's own side again.
  const [flipped, setFlipped] = useState<{ to: Color; as: Color | null } | null>(null);
  if (view === null && flipped !== null) setFlipped(null);

  if (flow.phase === "setup") return <SetupScreen onStart={flow.start} />;
  if (!view) return <BoardFallback />;
  const orientation = flipped && flipped.as === view.color ? flipped.to : (view.color ?? "w");
  const setOrientation = (to: Color) => setFlipped({ to, as: view.color });

  const whiteSeat = view.seatColors.indexOf("w");
  const blackSeat = view.seatColors.indexOf("b");
  const names = {
    w: flow.seatNames[whiteSeat] ?? "White",
    b: flow.seatNames[blackSeat] ?? "Black",
  };

  if (flow.phase === "finished" && view.result) {
    return (
      <ReviewBoard
        startFen={view.startFen}
        moves={view.history}
        result={view.result}
        timeControl={view.timeControl}
        names={names}
        aiColors={view.aiSeats.flatMap((s) => (view.seatColors[s] ? [view.seatColors[s]] : []))}
        viewer={view.color}
        date={new Date()}
        endActions={flow.endActions}
        orientation={orientation}
        onOrientationChange={setOrientation}
        announce
        extraActions={(ply) => (
          <PlayFromHere
            moves={view.history.slice(0, ply).map((h) => h.uci)}
            side={view.color ?? "w"}
            before={flow.changeSetup ?? undefined}
          />
        )}
      />
    );
  }

  return (
    <GameBoard
      view={view}
      color={view.color}
      names={names}
      legal={flow.legalActions}
      send={flow.sendAction}
      orientation={orientation}
      onOrientationChange={setOrientation}
    />
  );
}
