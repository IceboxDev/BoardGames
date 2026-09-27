import type { EKPlayerView, EKResult } from "@boardgames/core/games/exploding-kittens/machine";
import type { Action, Card, GameState } from "@boardgames/core/games/exploding-kittens/types";
import { BoardFallback } from "../../components/RouteFallback";
import { againstAi, type SoloStart, useSessionFlow } from "../../hooks/useSessionFlow";
import type { GameComponentProps } from "../types";
import GameBoard from "./components/GameBoard";
import GameOverScreen from "./components/GameOverScreen";
import SetupScreen from "./components/SetupScreen";

let nextPlaceholderId = -1;
function placeholderCards(count: number): Card[] {
  return Array.from({ length: count }, () => ({
    id: nextPlaceholderId--,
    type: "defuse" as const,
  }));
}

function viewToGameState(view: EKPlayerView, myPlayerIndex: number): GameState {
  nextPlaceholderId = -1;
  return {
    phase: view.phase,
    drawPile: placeholderCards(view.drawPileCount),
    discardPile: view.discardPile,
    players: view.players.map((p) => ({
      index: p.index,
      type: p.type,
      hand: p.index === myPlayerIndex ? view.hand : placeholderCards(p.handCount),
      alive: p.alive,
      aiStrategy: p.aiStrategy,
    })),
    currentPlayerIndex: view.currentPlayerIndex,
    turnsRemaining: view.turnsRemaining,
    turnCount: view.turnCount,
    nopeWindow: view.nopeWindow,
    favorContext: view.favorContext,
    stealContext: view.stealContext,
    discardPickContext: view.discardPickContext,
    peekContext: view.peekContext,
    explosionContext: view.explosionContext,
    actionLog: view.actionLog,
    winner: view.winner,
  };
}

interface EKSetup {
  playerCount: number;
  strategy: string;
}

const toSoloStart = ({ playerCount, strategy }: EKSetup): SoloStart => ({
  seats: againstAi(playerCount, strategy),
});

export default function ExplodingKittens({ source }: GameComponentProps) {
  const flow = useSessionFlow<EKPlayerView, Action, EKResult, EKSetup>(source, { toSoloStart });

  if (flow.phase === "setup") {
    return (
      <SetupScreen onStart={(playerCount, strategy) => flow.start({ playerCount, strategy })} />
    );
  }
  if (!flow.view) return <BoardFallback />;

  const displayState = viewToGameState(flow.view, flow.seat);

  if (flow.phase === "finished") {
    return (
      <GameOverScreen
        state={displayState}
        myIndex={flow.seat}
        seatNames={flow.seatNames}
        actions={flow.endActions}
      />
    );
  }

  return (
    <GameBoard
      state={displayState}
      myIndex={flow.seat}
      seatNames={flow.seatNames}
      onAction={flow.sendAction}
    />
  );
}
