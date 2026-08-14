import { getLegalActions } from "@boardgames/core/games/exploding-kittens/rules";
import type { Action, GameState } from "@boardgames/core/games/exploding-kittens/types";
import { useState } from "react";
import { GameDialogPanel } from "../../../components/game-layout";
import { Button } from "../../../components/ui/Button";

interface DefuseDialogProps {
  state: GameState;
  onAction: (action: Action) => void;
}

export default function DefuseDialog({ state, onAction }: DefuseDialogProps) {
  const ec = state.explosionContext;
  if (!ec) return null;

  const legalActions = getLegalActions(state);
  const defuseActions = legalActions.filter(
    (a): a is Action & { type: "play-defuse" } => a.type === "play-defuse",
  );
  const canDie = legalActions.some((a) => a.type === "skip-defuse");

  if (state.phase === "exploding") {
    return (
      <GameDialogPanel tone="danger" center spacious>
        <div className="mb-4">
          <span className="text-5xl">💣</span>
        </div>
        <p className="text-lg font-bold text-red-300">You drew an Exploding Kitten!</p>
        <p className="mt-1 text-sm text-fg-secondary">
          {defuseActions.length > 0
            ? "Play a Defuse card to survive!"
            : "You have no Defuse cards..."}
        </p>

        <div className="mt-4 flex justify-center gap-3">
          {defuseActions.map((a) => (
            <Button
              key={a.cardId}
              variant="solid"
              tone="emerald"
              size="md"
              onClick={() => onAction(a)}
            >
              🔧 Defuse!
            </Button>
          ))}
          {canDie && (
            <Button variant="secondary" size="md" onClick={() => onAction({ type: "skip-defuse" })}>
              Accept fate 💀
            </Button>
          )}
        </div>
      </GameDialogPanel>
    );
  }

  return null;
}

export function ReinsertDialog({
  state,
  onAction,
}: {
  state: GameState;
  onAction: (action: Action) => void;
}) {
  const [position, setPosition] = useState(0);
  const deckSize = state.drawPile.length;

  return (
    <GameDialogPanel
      tone="success"
      center
      spacious
      title="🔧 Kitten Defused!"
      subtitle="Choose where to secretly reinsert the Exploding Kitten."
    >
      <div className="mt-1 flex flex-col items-center gap-3">
        <div className="flex items-center gap-3 w-full max-w-xs">
          <span className="text-xs text-fg-muted w-8">Top</span>
          {/* biome-ignore lint/correctness/noRestrictedElements: range slider — no ui Slider primitive exists */}
          <input
            type="range"
            min={0}
            max={deckSize}
            value={position}
            onChange={(e) => setPosition(parseInt(e.target.value, 10))}
            className="flex-1 accent-emerald-500"
          />
          <span className="text-xs text-fg-muted w-12">Bottom</span>
        </div>
        <p className="text-xs text-fg-secondary">
          Position: {position} of {deckSize} (
          {position === 0 ? "top" : position === deckSize ? "bottom" : `${position} from top`})
        </p>
        <Button
          variant="solid"
          tone="emerald"
          size="md"
          onClick={() => onAction({ type: "reinsert-kitten", position })}
        >
          Place Kitten Here
        </Button>
      </div>
    </GameDialogPanel>
  );
}
