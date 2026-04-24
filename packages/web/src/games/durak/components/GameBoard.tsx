import type { Action, DurakPlayerView } from "@boardgames/core/games/durak/types";
import { useCallback, useMemo, useState } from "react";
import { ActionLog } from "../../../components/action-log";
import { CardDeck } from "../../../components/CardDeck";
import { GameScreen } from "../../../components/game-layout";
import { type PlayerEntry, PlayerListPanel } from "../../../components/SidePanel";
import cardBackUrl from "../assets/card-back.png";
import { getCardSvg } from "../card-svg";
import { mapDurakLog } from "../log-mapper";
import PlayerHand from "./PlayerHand";
import Table from "./Table";

interface GameBoardProps {
  view: DurakPlayerView;
  legalActions: Action[];
  playerIndex: number;
  isMyTurn: boolean;
  isAiThinking: boolean;
  onAction: (action: Action) => void;
}

export default function GameBoard({
  view,
  legalActions,
  playerIndex,
  isMyTurn,
  isAiThinking,
  onAction,
}: GameBoardProps) {
  const [selectedCardId, setSelectedCardId] = useState<number | null>(null);

  const isDefending = view.phase === "defending" && isMyTurn;

  // Can pass?
  const canPass = legalActions.some((a) => a.type === "pass");
  // Can take?
  const canTake = legalActions.some((a) => a.type === "take");

  // When defending: find which attack indices the selected card can defend
  const selectedDefendTargets = useMemo(() => {
    if (!isDefending || selectedCardId === null) return new Set<number>();
    const targets = new Set<number>();
    for (const a of legalActions) {
      if (a.type === "defend" && a.cardId === selectedCardId) {
        targets.add(a.attackIndex);
      }
    }
    return targets;
  }, [isDefending, selectedCardId, legalActions]);

  const handleCardSelect = useCallback(
    (cardId: number | null) => {
      if (cardId === null) {
        setSelectedCardId(null);
        return;
      }

      if (isDefending) {
        // In defend mode: select card, then click table slot
        setSelectedCardId(cardId);
        // If only one undefended card, auto-target it
        const undefendedIndices = view.table
          .map((p, i) => (p.defense === null ? i : -1))
          .filter((i) => i >= 0);
        if (undefendedIndices.length === 1) {
          const action = legalActions.find(
            (a) =>
              a.type === "defend" && a.cardId === cardId && a.attackIndex === undefendedIndices[0],
          );
          if (action) {
            onAction(action);
            setSelectedCardId(null);
            return;
          }
        }
      } else {
        // Attack / throw-in: select card (confirm via action bar)
        setSelectedCardId((prev) => (prev === cardId ? null : cardId));
      }
    },
    [isDefending, legalActions, onAction, view.table],
  );

  // Can the selected card be played (attack / throw-in)?
  const canPlaySelected =
    !isDefending &&
    selectedCardId !== null &&
    legalActions.some((a) => "cardId" in a && a.cardId === selectedCardId);

  const handleConfirmPlay = useCallback(() => {
    if (selectedCardId === null) return;
    const action = legalActions.find(
      (a) => a.type !== "defend" && "cardId" in a && a.cardId === selectedCardId,
    );
    if (action) {
      onAction(action);
      setSelectedCardId(null);
    }
  }, [selectedCardId, legalActions, onAction]);

  const handleClickUndefended = useCallback(
    (attackIndex: number) => {
      if (selectedCardId === null) return;
      const action = legalActions.find(
        (a) => a.type === "defend" && a.cardId === selectedCardId && a.attackIndex === attackIndex,
      );
      if (action) {
        onAction(action);
        setSelectedCardId(null);
      }
    },
    [selectedCardId, legalActions, onAction],
  );

  return (
    <GameScreen
      contentClassName=""
      sidebar={<ActionLog blocks={mapDurakLog(view.actionLog, view.players)} />}
      fan={
        <PlayerHand
          hand={view.hand}
          trumpSuit={view.trumpSuit}
          legalActions={legalActions}
          selectedCardId={selectedCardId}
          onSelectCard={handleCardSelect}
          disabled={!isMyTurn}
        />
      }
      fanActions={
        canPlaySelected ? (
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={handleConfirmPlay}
              className="rounded-lg border border-emerald-500/50 bg-emerald-500/15 px-4 py-1.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/25"
            >
              {view.phase === "throwing-in" ? "Throw In" : "Attack"}
            </button>
            {canPass && (
              <button
                type="button"
                onClick={() => {
                  onAction({ type: "pass" });
                  setSelectedCardId(null);
                }}
                className="rounded-lg border border-gray-600 bg-gray-700/60 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-gray-600"
              >
                {view.phase === "throwing-in" ? "Done" : "Pass"}
              </button>
            )}
          </div>
        ) : isMyTurn && (canPass || canTake) ? (
          <div className="flex items-center justify-center gap-2">
            {canPass && (
              <button
                type="button"
                onClick={() => {
                  onAction({ type: "pass" });
                  setSelectedCardId(null);
                }}
                className="rounded-lg border border-gray-600 bg-gray-700/60 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-gray-600"
              >
                {view.phase === "throwing-in" ? "Done" : "Pass"}
              </button>
            )}
            {canTake && (
              <button
                type="button"
                onClick={() => {
                  onAction({ type: "take" });
                  setSelectedCardId(null);
                }}
                className="rounded-lg border border-red-700/50 bg-red-900/30 px-4 py-1.5 text-xs font-medium text-red-300 transition hover:bg-red-900/50"
              >
                Take Cards
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-semibold ${isMyTurn ? "text-cyan-400" : "text-amber-400"}`}
            >
              {isMyTurn ? "Your turn" : isAiThinking ? "AI" : "Opponent"}
            </span>
            <span className="text-gray-500">&middot;</span>
            <span className="text-xs text-gray-400">
              {isAiThinking
                ? "Thinking..."
                : !isMyTurn
                  ? view.phase === "attacking"
                    ? "Attacking..."
                    : view.phase === "defending"
                      ? "Defending..."
                      : view.phase === "throwing-in"
                        ? "Adding cards..."
                        : "Waiting..."
                  : view.phase === "defending"
                    ? "Select a card, then click the attack to beat"
                    : "Play a card to attack"}
            </span>
            {(isAiThinking || !isMyTurn) && (
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
            turnCount={view.turnCount + 1}
            players={view.players.map((p): PlayerEntry => {
              const isMe = p.index === playerIndex;
              return {
                index: p.index,
                label: isMe ? "You" : `AI ${p.index}`,
                handCount: isMe ? view.hand.length : p.handCount,
                alive: !p.isOut,
                isActive: view.attackerIndex === p.index || view.defenderIndex === p.index,
                role:
                  view.attackerIndex === p.index
                    ? "attacker"
                    : view.defenderIndex === p.index
                      ? "defender"
                      : undefined,
              };
            })}
          />
        </div>

        {/* Main board column */}
        <div className="flex min-h-0 flex-1 flex-col gap-2 border-2 border-dashed border-orange-400/40">
          {/* Table — fills available space */}
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <Table
              table={view.table}
              trumpSuit={view.trumpSuit}
              isDefending={isDefending && selectedCardId !== null}
              onClickUndefended={
                isDefending && selectedCardId !== null && selectedDefendTargets.size > 0
                  ? handleClickUndefended
                  : undefined
              }
            />
          </div>
        </div>

        {/* Deck column */}
        <div className="flex w-36 shrink-0 flex-col items-center justify-center gap-6 border-2 border-dashed border-purple-400/40">
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
              Draw
            </span>
            <CardDeck
              count={view.drawPileCount}
              size="lg"
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
              trump={{
                render: (cls) => (
                  <div className={`${cls} overflow-hidden bg-white px-[4%]`}>
                    <img
                      src={getCardSvg(view.trumpCard.rank, view.trumpCard.suit)}
                      alt="Trump card"
                      className="h-full w-full object-fill"
                      draggable={false}
                    />
                  </div>
                ),
              }}
            />
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
              Discard
            </span>
            <CardDeck
              count={view.discardPileCount}
              size="lg"
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
              renderTop={
                view.topDiscardCard
                  ? ((topCard) => (cls: string) => (
                      <div className={`${cls} overflow-hidden bg-white px-[4%]`}>
                        <img
                          src={getCardSvg(topCard.rank, topCard.suit)}
                          alt="Top discard"
                          className="h-full w-full object-fill"
                          draggable={false}
                        />
                      </div>
                    ))(view.topDiscardCard)
                  : undefined
              }
            />
          </div>
        </div>
      </div>
    </GameScreen>
  );
}
