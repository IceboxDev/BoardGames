import type { Action, Card as CardData, DurakPlayerView } from "@boardgames/core/games/durak/types";
import { RANK_LABELS, SUIT_COLORS, SUIT_SYMBOLS } from "@boardgames/core/games/durak/types";
import { useCallback, useMemo, useState } from "react";
import { HistorySidebar } from "../../../components/action-log";
import { AiThinkingIndicator, WaitingIndicator } from "../../../components/ui";
import DurakActionLog from "./ActionLog";
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

  const isPlayerAttacker = view.attackerIndex === playerIndex;
  const isPlayerDefender = view.defenderIndex === playerIndex;

  const opponent = view.players.find((p) => p.index !== playerIndex);

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
        // Attack / throw-in: play immediately on click
        const action = legalActions.find((a) => "cardId" in a && a.cardId === cardId);
        if (action) {
          onAction(action);
          setSelectedCardId(null);
          return;
        }
        setSelectedCardId(cardId);
      }
    },
    [isDefending, legalActions, onAction, view.table],
  );

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

  // Status message
  const statusMessage = getStatusMessage(view, isMyTurn, isAiThinking);

  return (
    <HistorySidebar
      contentClassName="mx-auto max-w-2xl gap-2"
      sidebar={<DurakActionLog entries={view.actionLog} players={view.players} />}
    >
      {/* Opponent info bar */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <RoleBadge
            isAttacker={view.attackerIndex === (opponent?.index ?? 1)}
            isDefender={view.defenderIndex === (opponent?.index ?? 1)}
          />
          <span className="text-xs text-gray-500">
            Opponent &middot; {opponent?.handCount ?? 0} cards
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <TrumpDisplay card={view.trumpCard} drawPileCount={view.drawPileCount} />
          <span>
            R{view.turnCount} &middot; {view.discardPileCount} discard
          </span>
        </div>
      </div>

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

      {/* Status + action buttons */}
      <div className="flex items-center justify-center gap-3 px-1">
        <div className="flex-1">
          {isAiThinking ? (
            <AiThinkingIndicator message={statusMessage} />
          ) : !isMyTurn ? (
            <WaitingIndicator message={statusMessage} />
          ) : (
            <div className="rounded-lg bg-emerald-500/10 px-3 py-1.5 text-center text-xs font-medium text-emerald-400">
              {statusMessage}
            </div>
          )}
        </div>
        {isMyTurn && canPass && (
          <button
            type="button"
            onClick={() => {
              onAction({ type: "pass" });
              setSelectedCardId(null);
            }}
            className="shrink-0 rounded-lg border border-gray-600 bg-gray-700/60 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-gray-600"
          >
            {view.phase === "throwing-in" ? "Done" : "Pass"}
          </button>
        )}
        {isMyTurn && canTake && (
          <button
            type="button"
            onClick={() => {
              onAction({ type: "take" });
              setSelectedCardId(null);
            }}
            className="shrink-0 rounded-lg border border-red-700/50 bg-red-900/30 px-4 py-1.5 text-xs font-medium text-red-300 transition hover:bg-red-900/50"
          >
            Take Cards
          </button>
        )}
      </div>

      {/* Player info + hand */}
      <div className="flex items-center justify-between px-1">
        <RoleBadge isAttacker={isPlayerAttacker} isDefender={isPlayerDefender} />
        <span className="text-xs text-gray-500">{view.hand.length} cards</span>
      </div>
      <div className="shrink-0">
        <PlayerHand
          hand={view.hand}
          trumpSuit={view.trumpSuit}
          legalActions={legalActions}
          selectedCardId={selectedCardId}
          onSelectCard={handleCardSelect}
          disabled={!isMyTurn}
        />
      </div>
    </HistorySidebar>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TrumpDisplay({ card, drawPileCount }: { card: CardData; drawPileCount: number }) {
  const color = SUIT_COLORS[card.suit] === "red" ? "text-red-400" : "text-gray-300";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-amber-400">{SUIT_SYMBOLS[card.suit]}</span>
      <span className={`font-semibold ${color}`}>{RANK_LABELS[card.rank]}</span>
      <span className="text-gray-600">&middot;</span>
      <span>{drawPileCount} left</span>
    </span>
  );
}

function RoleBadge({ isAttacker, isDefender }: { isAttacker: boolean; isDefender: boolean }) {
  if (isAttacker) {
    return (
      <span className="inline-flex items-center rounded-full bg-orange-500/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400 ring-1 ring-inset ring-orange-500/30">
        Attacker
      </span>
    );
  }
  if (isDefender) {
    return (
      <span className="inline-flex items-center rounded-full bg-sky-500/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-sky-400 ring-1 ring-inset ring-sky-500/30">
        Defender
      </span>
    );
  }
  return null;
}

function getStatusMessage(view: DurakPlayerView, isMyTurn: boolean, isAiThinking: boolean): string {
  if (isAiThinking) return "AI is thinking...";

  if (!isMyTurn) {
    if (view.phase === "attacking") return "Opponent is attacking...";
    if (view.phase === "defending") return "Opponent is defending...";
    if (view.phase === "throwing-in") return "Opponent is adding cards...";
    return "Waiting for opponent...";
  }

  if (view.phase === "attacking") {
    if (view.table.length === 0) return "Your attack! Play a card.";
    return "All defended. Throw in more cards or pass.";
  }
  if (view.phase === "defending") {
    return "Defend! Select a card, then click the attack to beat.";
  }
  if (view.phase === "throwing-in") {
    return "Throw in more matching cards or click Done.";
  }

  return "";
}
