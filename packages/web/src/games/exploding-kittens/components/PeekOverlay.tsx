import type { Action, GameState } from "@boardgames/core/games/exploding-kittens/types";
import { GameDialogPanel } from "../../../components/game-layout";
import { Button } from "../../../components/ui/Button";
import Card from "./Card";

interface PeekOverlayProps {
  state: GameState;
  onAction: (action: Action) => void;
}

export default function PeekOverlay({ state, onAction }: PeekOverlayProps) {
  const pc = state.peekContext;
  if (!pc) return null;

  return (
    <GameDialogPanel
      tone="arcane"
      center
      title="🔮 See the Future"
      subtitle={`Top ${pc.cards.length} cards of the draw pile (left = top):`}
    >
      <div className="mb-4 flex justify-center gap-3">
        {pc.cards.map((card, i) => (
          <div key={card.id} className="flex flex-col items-center gap-1">
            <span className="text-3xs text-fg-muted">
              {i === 0 ? "Next" : i === 1 ? "2nd" : "3rd"}
            </span>
            <Card card={card} disabled size="sm" />
          </div>
        ))}
      </div>

      <Button
        variant="solid"
        tone="purple"
        size="md"
        onClick={() => onAction({ type: "acknowledge-peek" })}
      >
        Got it
      </Button>
    </GameDialogPanel>
  );
}
