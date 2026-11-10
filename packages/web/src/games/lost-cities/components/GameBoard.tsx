import { canPlayToExpedition, getLegalDraws } from "@boardgames/core/games/lost-cities/rules";
import type {
  Card as CardData,
  DiscardPiles,
  ExpeditionColor,
  Expeditions,
  GamePhase,
  PlayerIndex,
  TurnPhase,
} from "@boardgames/core/games/lost-cities/types";
import { COLOR_LABELS } from "@boardgames/core/games/lost-cities/types";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { GameScreen } from "../../../components/game-layout";
import { Button } from "../../../components/ui/Button";
import DrawPile from "./DrawPile";
import FlatPlayerHand, { type FlatPlayerHandProps } from "./FlatPlayerHand";
import PlayerHand from "./PlayerHand";
import TrailsBoard from "./trails/TrailsBoard";

/**
 * Display-only view of the board. Contains only public / visible state —
 * no hand contents, no draw-pile contents. Built by the caller from either
 * a live `LostCitiesPlayerView` or a replay step.
 */
export interface BoardState {
  expeditions: [Expeditions, Expeditions];
  discardPiles: DiscardPiles;
  drawPileCount: number;
  currentPlayer: PlayerIndex;
  turnPhase: TurnPhase;
  phase: GamePhase;
  lastDiscardedColor: ExpeditionColor | null;
  turnCount: number;
}

interface GameBoardInteractiveProps {
  mode?: "interactive";
  state: BoardState;
  /** Cards the human player holds — kept separate from {@link BoardState} so the board state is pure display. */
  hand: CardData[];
  selectedCardId: number | null;
  /** [you, the opponent] — the opponent's real name, never a generic label. */
  names: [string, string];
  /** The opponent is a person (a room), not the AI. */
  opponentIsHuman?: boolean;
  onSelectCard: (card: CardData) => void;
  onPlayToExpedition: () => void;
  onDiscard: () => void;
  onDrawFromPile: () => void;
  onDrawFromDiscard: (color: ExpeditionColor) => void;
  sidebar?: ReactNode;
}

interface GameBoardReplayProps {
  mode: "replay";
  state: BoardState;
  /** [P0 bottom, P1 top] — same indexing as {@link BoardState.expeditions}. */
  replayLabels: [string, string];
  replayTopHand: FlatPlayerHandProps;
  replayBottomHand: FlatPlayerHandProps;
  /** Tighter layout so the board fits the viewport without scrolling. */
  replayCompact?: boolean;
}

export type GameBoardProps = GameBoardInteractiveProps | GameBoardReplayProps;

const valueLabel = (card: CardData) => (card.type === "wager" ? "wager" : String(card.value));

export default function GameBoard(props: GameBoardProps) {
  const interactive = props.mode !== "replay" ? props : null;

  // P / D / Space: play, discard, draw from the deck.
  useEffect(() => {
    if (!interactive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input,textarea,select")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "p") interactive.onPlayToExpedition();
      else if (k === "d") interactive.onDiscard();
      else if (k === " ") {
        e.preventDefault();
        interactive.onDrawFromPile();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [interactive]);

  if (props.mode === "replay") {
    const { state, replayLabels, replayTopHand, replayBottomHand, replayCompact = true } = props;
    return (
      <div className="flex h-full min-h-0 flex-col gap-2">
        <FlatPlayerHand {...replayTopHand} compact={replayCompact} />
        <TrailsBoard
          mine={state.expeditions[0]}
          theirs={state.expeditions[1]}
          discardPiles={state.discardPiles}
          names={{ me: replayLabels[0], them: replayLabels[1] }}
          highlightId={replayBottomHand.highlightCardId ?? replayTopHand.highlightCardId}
        />
        <FlatPlayerHand {...replayBottomHand} compact={replayCompact} />
      </div>
    );
  }

  const {
    state,
    hand,
    selectedCardId,
    names,
    opponentIsHuman = false,
    onSelectCard,
    onPlayToExpedition,
    onDiscard,
    onDrawFromPile,
    onDrawFromDiscard,
    sidebar,
  } = props;

  const over = state.phase === "game-over";
  const myTurn = state.currentPlayer === 0 && !over;
  const playStep = myTurn && state.turnPhase === "play";
  const drawStep = myTurn && state.turnPhase === "draw";

  const legalDraws = drawStep
    ? getLegalDraws(state.discardPiles, state.drawPileCount, state.lastDiscardedColor)
    : [];
  const takeable = new Set(legalDraws.flatMap((d) => (d.kind === "discard-pile" ? [d.color] : [])));
  const canDrawDeck = legalDraws.some((d) => d.kind === "draw-pile");

  const selected = playStep ? (hand.find((c) => c.id === selectedCardId) ?? null) : null;
  const canPlay = selected
    ? canPlayToExpedition(selected, state.expeditions[0][selected.color])
    : false;

  // Buttons only, at fixed widths: the row never changes shape between steps.
  const BTN = "w-40 truncate whitespace-nowrap sm:w-56";
  const actions = over ? null : playStep ? (
    <div className="flex items-center justify-center gap-2">
      <Button
        variant="primary"
        size="sm"
        className={BTN}
        disabled={!canPlay}
        onClick={onPlayToExpedition}
        title="P"
      >
        {selected
          ? canPlay
            ? `Play ${valueLabel(selected)} to ${COLOR_LABELS[selected.color]}`
            : `${COLOR_LABELS[selected.color]} is past it`
          : "Play a card"}
      </Button>
      <Button
        variant="secondary"
        size="sm"
        className={BTN}
        disabled={!selected}
        onClick={onDiscard}
        title="D"
      >
        {selected ? `Discard ${valueLabel(selected)}` : "Discard"}
      </Button>
    </div>
  ) : drawStep ? (
    <div className="flex items-center justify-center gap-2">
      <Button
        variant="primary"
        size="sm"
        className={BTN}
        disabled={!canDrawDeck}
        onClick={onDrawFromPile}
        title="Space — or take a lit camp"
      >
        Draw from the deck · {state.drawPileCount}
      </Button>
    </div>
  ) : (
    <div className="flex items-center justify-center gap-2">
      <Button variant="secondary" size="sm" className={BTN} disabled>
        {opponentIsHuman ? `Waiting for ${names[1]}` : `${names[1]} is thinking`}
      </Button>
    </div>
  );

  return (
    <GameScreen
      sidebar={sidebar}
      leftSidebar={
        <DrawPile state={state} names={names} canDraw={canDrawDeck} onDraw={onDrawFromPile} />
      }
      leftSidebarLabel="Deck & score"
      fan={
        <PlayerHand
          hand={hand}
          selectedCardId={selectedCardId}
          onSelectCard={onSelectCard}
          disabled={!playStep}
        />
      }
      fanActions={actions}
    >
      <TrailsBoard
        mine={state.expeditions[0]}
        theirs={state.expeditions[1]}
        discardPiles={state.discardPiles}
        names={{ me: names[0], them: names[1] }}
        selected={selected}
        canPlaySelected={canPlay}
        takeable={takeable}
        lockedColor={drawStep ? state.lastDiscardedColor : null}
        onTake={drawStep ? onDrawFromDiscard : undefined}
      />
    </GameScreen>
  );
}
