import { sortHand } from "@boardgames/core/games/exploding-kittens/deck";
import {
  getActiveDecider,
  getLegalActions,
  getValidCombos,
} from "@boardgames/core/games/exploding-kittens/rules";
import type {
  Action,
  Card as CardData,
  GameState,
} from "@boardgames/core/games/exploding-kittens/types";
import {
  CARD_COLORS,
  CARD_EMOJI,
  CARD_LABELS,
} from "@boardgames/core/games/exploding-kittens/types";
import { useMemo, useState } from "react";
import { ActionLog } from "../../../components/action-log";
import { CardDeck } from "../../../components/CardDeck";
import { GameScreen } from "../../../components/game-layout";
import { type PlayerEntry, PlayerListPanel } from "../../../components/SidePanel";
import { AiThinkingIndicator } from "../../../components/ui";
import { getCardImageUrl, getCardSkin } from "../assets/card-art";
import cardBackUrl from "../assets/card-back.png";
import { mapEKLog } from "../log-mapper";
import Card from "./Card";
import DefuseDialog, { ReinsertDialog } from "./DefuseDialog";
import DiscardPile from "./DiscardPile";
import FavorDialog from "./FavorDialog";
import NopeWindow from "./NopeWindow";
import PeekOverlay from "./PeekOverlay";
import PlayerHand from "./PlayerHand";
import StealDialog from "./StealDialog";

interface GameBoardProps {
  state: GameState;
  onAction?: (action: Action) => void;
  replayMode?: boolean;
  stepDescription?: string;
}

export default function GameBoard({
  state,
  onAction,
  replayMode = false,
  stepDescription,
}: GameBoardProps) {
  const humanIndex = state.players.findIndex((p) => p.type === "human");
  const viewerIndex = replayMode ? 0 : humanIndex;
  const activeDecider = getActiveDecider(state);
  const isHumanTurn = !replayMode && activeDecider === humanIndex && state.phase !== "game-over";

  const showNopeWindow =
    !replayMode && state.phase === "nope-window" && activeDecider === humanIndex;

  const showExploding = !replayMode && state.phase === "exploding" && activeDecider === humanIndex;

  const showReinserting =
    !replayMode && state.phase === "reinserting" && activeDecider === humanIndex;

  const showFavor =
    !replayMode && state.phase === "resolving-favor" && activeDecider === humanIndex;

  const showChoosingTarget =
    !replayMode && state.phase === "choosing-target" && activeDecider === humanIndex;

  const showChoosingCardName =
    !replayMode && state.phase === "choosing-card-name" && activeDecider === humanIndex;

  const showPeek = !replayMode && state.phase === "peeking" && activeDecider === humanIndex;

  const showDiscardPick =
    !replayMode && state.phase === "choosing-discard" && activeDecider === humanIndex;

  const isActionPhaseForHuman = !replayMode && state.phase === "action-phase" && isHumanTurn;

  // Selection state (lifted from PlayerHand for action-bar buttons)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const player = state.players[viewerIndex >= 0 ? viewerIndex : state.currentPlayerIndex];
  const legalActions = useMemo(
    () => (isActionPhaseForHuman ? getLegalActions(state) : []),
    [state, isActionPhaseForHuman],
  );
  const playableCardIds = useMemo(
    () =>
      new Set(
        legalActions
          .filter((a): a is Action & { type: "play-card" } => a.type === "play-card")
          .map((a) => a.cardId),
      ),
    [legalActions],
  );
  const combos = useMemo(() => getValidCombos(sortHand(player.hand)), [player.hand]);
  const selectedCombo = useMemo(() => {
    if (selectedIds.size < 2) return null;
    return combos.find(
      (c) => c.cardIds.length === selectedIds.size && c.cardIds.every((id) => selectedIds.has(id)),
    );
  }, [selectedIds, combos]);
  const canDraw = legalActions.some((a) => a.type === "end-action-phase");
  const singleSelected = selectedIds.size === 1 && playableCardIds.has(Array.from(selectedIds)[0]);

  function toggleCard(card: CardData) {
    if (!isActionPhaseForHuman) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(card.id)) next.delete(card.id);
      else next.add(card.id);
      return next;
    });
  }

  function handlePlaySingle() {
    if (selectedIds.size !== 1 || !onAction) return;
    const cardId = Array.from(selectedIds)[0];
    if (playableCardIds.has(cardId)) {
      setSelectedIds(new Set());
      onAction({ type: "play-card", cardId });
    }
  }

  function handlePlayCombo() {
    if (!selectedCombo || !onAction) return;
    setSelectedIds(new Set());
    onAction({ type: "play-combo", cardIds: selectedCombo.cardIds });
  }

  function handleDraw() {
    if (!onAction) return;
    setSelectedIds(new Set());
    onAction({ type: "end-action-phase" });
  }

  const dispatch = onAction ?? (() => {});

  const replayFanActions = replayMode ? (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-400">{stepDescription ?? ""}</span>
    </div>
  ) : undefined;

  return (
    <GameScreen
      sidebar={<ActionLog blocks={mapEKLog(state.actionLog ?? [], state.players)} />}
      fan={
        viewerIndex >= 0 && !replayMode ? (
          <PlayerHand
            hand={player.hand}
            selectedIds={selectedIds}
            onToggleCard={toggleCard}
            disabled={!isActionPhaseForHuman}
          />
        ) : undefined
      }
      fanActions={
        replayMode ? (
          replayFanActions
        ) : isActionPhaseForHuman ? (
          <div className="flex items-center justify-center gap-2">
            {singleSelected && (
              <button
                type="button"
                onClick={handlePlaySingle}
                className="rounded-lg border border-emerald-500/50 bg-emerald-500/15 px-4 py-1.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/25"
              >
                Play Card
              </button>
            )}
            {selectedCombo && (
              <button
                type="button"
                onClick={handlePlayCombo}
                className="rounded-lg border border-purple-500/50 bg-purple-500/15 px-4 py-1.5 text-xs font-medium text-purple-300 transition hover:bg-purple-500/25"
              >
                Play{" "}
                {selectedCombo.comboType === "pair"
                  ? "Pair"
                  : selectedCombo.comboType === "triple"
                    ? "Triple"
                    : "5-Different"}{" "}
                Combo
              </button>
            )}
            {canDraw && (
              <button
                type="button"
                onClick={handleDraw}
                className="rounded-lg border border-gray-600 bg-gray-700/60 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-gray-600"
              >
                Draw Card
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-semibold ${isHumanTurn ? "text-cyan-400" : "text-amber-400"}`}
            >
              {isHumanTurn ? "Your turn" : `AI ${activeDecider}'s turn`}
            </span>
            <span className="text-gray-500">&middot;</span>
            <span className="text-xs text-gray-400">
              {isHumanTurn ? "Respond to the dialog above" : "Waiting for AI..."}
            </span>
            {!isHumanTurn && (
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
            )}
          </div>
        )
      }
    >
      <div className="flex min-h-0 flex-1 gap-3">
        {/* Left stats column */}
        <div className="hidden w-36 shrink-0 flex-col border-2 border-dashed border-blue-400/40 lg:flex">
          <PlayerListPanel
            turnCount={state.turnCount}
            players={state.players.map(
              (p): PlayerEntry => ({
                index: p.index,
                label: p.type === "human" ? "You" : `AI ${p.index}`,
                handCount: p.hand.length,
                alive: p.alive,
                isActive: p.index === state.currentPlayerIndex && p.alive,
              }),
            )}
            extra={
              state.turnsRemaining > 1 ? (
                <span className="text-[10px] text-amber-400">
                  {state.turnsRemaining} turns left
                </span>
              ) : undefined
            }
          />
        </div>

        {/* Main content */}
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto border-2 border-dashed border-orange-400/40">
          {showDiscardPick && (
            <DiscardPile
              cards={state.discardPile}
              selectable
              onSelect={(cardId) => dispatch({ type: "select-discard-card", cardId })}
            />
          )}

          {replayMode && (
            <div className="space-y-3">
              {state.players.map((p) =>
                p.alive ? (
                  <div key={p.index}>
                    <p className="mb-1 text-xs text-gray-400">
                      {p.type === "human" ? "You" : `Player ${p.index}`}
                      {p.index === state.currentPlayerIndex && (
                        <span className="ml-1 text-emerald-400">(active)</span>
                      )}
                      {" \u00b7 "}
                      {p.hand.length} cards
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {sortHand(p.hand).map((card) => (
                        <Card key={card.id} card={card} size="sm" disabled />
                      ))}
                    </div>
                  </div>
                ) : null,
              )}
            </div>
          )}

          {showNopeWindow && <NopeWindow state={state} onAction={dispatch} />}

          {showExploding && <DefuseDialog state={state} onAction={dispatch} />}

          {showReinserting && <ReinsertDialog state={state} onAction={dispatch} />}

          {showFavor && <FavorDialog state={state} onAction={dispatch} />}

          {(showChoosingTarget || showChoosingCardName) && (
            <StealDialog state={state} onAction={dispatch} />
          )}

          {showPeek && <PeekOverlay state={state} onAction={dispatch} />}

          {!replayMode && !isHumanTurn && state.phase !== "game-over" && (
            <AiThinkingIndicator
              message={
                state.phase === "nope-window"
                  ? `AI ${activeDecider} is deciding about Nope...`
                  : `AI ${activeDecider}'s turn...`
              }
            />
          )}
        </div>

        {/* Deck column */}
        <div className="flex w-36 shrink-0 flex-col items-center justify-center gap-6 border-2 border-dashed border-purple-400/40">
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
              Draw
            </span>
            <CardDeck
              count={state.drawPile.length}
              size="lg"
              glowing={isActionPhaseForHuman && canDraw}
              onClick={isActionPhaseForHuman && canDraw ? handleDraw : undefined}
              renderBack={(cls) => (
                <div className={`${cls} overflow-hidden`}>
                  <img
                    src={cardBackUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                </div>
              )}
            />
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
              Discard
            </span>
            <CardDeck
              count={state.discardPile.length}
              size="lg"
              renderBack={(cls) => (
                <div
                  className={`${cls} flex items-center justify-center bg-gradient-to-br from-gray-700 to-gray-800`}
                >
                  <span className="text-2xl">🐱</span>
                </div>
              )}
              renderTop={
                state.discardPile.length > 0
                  ? (cls) => {
                      const topCard = state.discardPile[0];
                      const skin = getCardSkin(topCard.type, topCard.id);
                      if (skin) {
                        return (
                          <div className={`${cls} overflow-hidden`}>
                            <img
                              src={getCardImageUrl(skin.file)}
                              alt={CARD_LABELS[topCard.type]}
                              className="h-full w-full object-cover"
                              draggable={false}
                            />
                          </div>
                        );
                      }
                      return (
                        <div
                          className={`${cls} flex flex-col items-center justify-center text-white`}
                          style={{ backgroundColor: CARD_COLORS[topCard.type] }}
                        >
                          <span className="text-lg leading-none">{CARD_EMOJI[topCard.type]}</span>
                          <span className="mt-0.5 text-[8px] font-semibold leading-tight">
                            {CARD_LABELS[topCard.type]}
                          </span>
                        </div>
                      );
                    }
                  : undefined
              }
            />
          </div>
        </div>
      </div>
    </GameScreen>
  );
}
