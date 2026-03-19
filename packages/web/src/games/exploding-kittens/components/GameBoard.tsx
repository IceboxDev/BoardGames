import { getActiveDecider } from "@boardgames/core/games/exploding-kittens/rules";
import type { Action, GameState } from "@boardgames/core/games/exploding-kittens/types";
import ActionLog from "./ActionLog";
import DefuseDialog, { ReinsertDialog } from "./DefuseDialog";
import DiscardPile from "./DiscardPile";
import DrawPile from "./DrawPile";
import FavorDialog from "./FavorDialog";
import NopeWindow from "./NopeWindow";
import PeekOverlay from "./PeekOverlay";
import PlayerHand from "./PlayerHand";
import PlayerStatus from "./PlayerStatus";
import StealDialog from "./StealDialog";

interface GameBoardProps {
  state: GameState;
  onAction: (action: Action) => void;
}

export default function GameBoard({ state, onAction }: GameBoardProps) {
  const humanIndex = state.players.findIndex((p) => p.type === "human");
  const activeDecider = getActiveDecider(state);
  const isHumanTurn = activeDecider === humanIndex && state.phase !== "game-over";

  const showNopeWindow = state.phase === "nope-window" && activeDecider === humanIndex;

  const showExploding = state.phase === "exploding" && activeDecider === humanIndex;

  const showReinserting = state.phase === "reinserting" && activeDecider === humanIndex;

  const showFavor = state.phase === "resolving-favor" && activeDecider === humanIndex;

  const showChoosingTarget = state.phase === "choosing-target" && activeDecider === humanIndex;

  const showChoosingCardName = state.phase === "choosing-card-name" && activeDecider === humanIndex;

  const showPeek = state.phase === "peeking" && activeDecider === humanIndex;

  const showDiscardPick = state.phase === "choosing-discard" && activeDecider === humanIndex;

  const isActionPhaseForHuman = state.phase === "action-phase" && isHumanTurn;

  return (
    <div className="flex gap-6">
      <div className="flex-1 space-y-6">
        <PlayerStatus state={state} />

        <div className="flex gap-6 items-start">
          <DrawPile count={state.drawPile.length} />
          <DiscardPile
            cards={state.discardPile}
            selectable={showDiscardPick}
            onSelect={
              showDiscardPick
                ? (cardId) => onAction({ type: "select-discard-card", cardId })
                : undefined
            }
          />
        </div>

        {showNopeWindow && <NopeWindow state={state} onAction={onAction} />}

        {showExploding && <DefuseDialog state={state} onAction={onAction} />}

        {showReinserting && <ReinsertDialog state={state} onAction={onAction} />}

        {showFavor && <FavorDialog state={state} onAction={onAction} />}

        {(showChoosingTarget || showChoosingCardName) && (
          <StealDialog state={state} onAction={onAction} />
        )}

        {showPeek && <PeekOverlay state={state} onAction={onAction} />}

        {!isHumanTurn && state.phase !== "game-over" && (
          <div className="rounded-lg bg-gray-800/50 py-3 text-center text-sm text-gray-400">
            {state.phase === "nope-window"
              ? `AI ${activeDecider} is deciding about Nope...`
              : `AI ${activeDecider}'s turn...`}
          </div>
        )}

        {humanIndex >= 0 && (
          <PlayerHand state={state} onAction={onAction} disabled={!isActionPhaseForHuman} />
        )}
      </div>

      <div className="w-72 shrink-0">
        <p className="mb-2 text-sm font-semibold text-gray-300">Action History</p>
        <ActionLog entries={state.actionLog ?? []} players={state.players} />
      </div>
    </div>
  );
}
