import type { Action, GameState } from "@boardgames/core/games/exploding-kittens/types";
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
    <div className="rounded-xl border border-purple-700/50 bg-purple-950/40 p-4 text-center">
      <p className="mb-1 text-sm font-medium text-purple-300">🔮 See the Future</p>
      <p className="mb-3 text-xs text-fg-secondary">
        Top {pc.cards.length} cards of the draw pile (left = top):
      </p>

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
        variant="primary"
        size="md"
        onClick={() => onAction({ type: "acknowledge-peek" })}
        className="!bg-purple-600 !shadow-purple-500/20 hover:!bg-purple-500"
      >
        Got it
      </Button>
    </div>
  );
}
