import type {
  LostCitiesLegalAction,
  LostCitiesPlayerView,
  LostCitiesResult,
} from "@boardgames/core/games/lost-cities/machine";
import type { Card, ExpeditionColor } from "@boardgames/core/games/lost-cities/types";
import { useCallback, useState } from "react";
import { ActionLog } from "../../components/action-log";
import { BoardFallback } from "../../components/RouteFallback";
import { againstAi, type SoloStart, useSessionFlow } from "../../hooks/useSessionFlow";
import type { GameComponentProps } from "../types";
import type { BoardState } from "./components/GameBoard";
import GameBoard from "./components/GameBoard";
import GameOverScreen from "./components/GameOverScreen";
import SetupScreen from "./components/SetupScreen";
import { mapLostCitiesLog } from "./log-mapper";

function viewToBoardState(view: LostCitiesPlayerView): BoardState {
  return {
    expeditions: [view.playerExpeditions, view.opponentExpeditions],
    discardPiles: view.discardPiles,
    drawPileCount: view.drawPileCount,
    currentPlayer: view.currentPlayer,
    turnPhase: view.turnPhase,
    phase: view.phase,
    lastDiscardedColor: view.lastDiscardedColor,
    turnCount: view.turnCount,
  };
}

const toSoloStart = (strategy: string): SoloStart => ({ seats: againstAi(2, strategy) });

/**
 * Lost Cities, solo and in a room. Every move the player makes is one of the
 * legal actions the server listed — picked here by what was clicked.
 */
export default function LostCities({ source }: GameComponentProps) {
  const flow = useSessionFlow<
    LostCitiesPlayerView,
    LostCitiesLegalAction,
    LostCitiesResult,
    string
  >(source, { toSoloStart });
  const [selectedCardId, setSelectedCardId] = useState<number | null>(null);
  const { legalActions, sendAction } = flow;

  const play = useCallback(
    (kind: "expedition" | "discard") => {
      const move = legalActions.find(
        (l) => l.phase === "play" && l.action.kind === kind && l.action.card.id === selectedCardId,
      );
      if (!move) return;
      sendAction(move);
      setSelectedCardId(null);
    },
    [legalActions, sendAction, selectedCardId],
  );

  const draw = useCallback(
    (color: ExpeditionColor | null) => {
      const move = legalActions.find(
        (l) =>
          l.phase === "draw" &&
          (color === null
            ? l.action.kind === "draw-pile"
            : l.action.kind === "discard-pile" && l.action.color === color),
      );
      if (move) sendAction(move);
    },
    [legalActions, sendAction],
  );

  const handleSelectCard = useCallback((card: Card) => {
    setSelectedCardId((prev) => (prev === card.id ? null : card.id));
  }, []);

  if (flow.phase === "setup") {
    return (
      <SetupScreen
        onSelect={(strategy) => {
          setSelectedCardId(null);
          flow.start(strategy);
        }}
      />
    );
  }

  const opponentName = flow.seatNames[1 - flow.seat] ?? "Opponent";

  if (flow.phase === "finished" && flow.result) {
    return (
      <GameOverScreen
        scores={flow.result.scores}
        myIndex={flow.seat}
        opponentName={opponentName}
        actions={flow.endActions}
      />
    );
  }

  const view = flow.view;
  if (!view) return <BoardFallback />;

  return (
    <GameBoard
      state={viewToBoardState(view)}
      hand={view.playerHand}
      selectedCardId={flow.isMyTurn ? selectedCardId : null}
      isMultiplayer={source === "mp"}
      onSelectCard={handleSelectCard}
      onPlayToExpedition={() => play("expedition")}
      onDiscard={() => play("discard")}
      onDrawFromPile={() => draw(null)}
      onDrawFromDiscard={(color) => draw(color)}
      sidebar={<ActionLog blocks={mapLostCitiesLog(view.actionLog ?? [], ["You", opponentName])} />}
      isWaiting={source === "mp" && !flow.isMyTurn}
    />
  );
}
