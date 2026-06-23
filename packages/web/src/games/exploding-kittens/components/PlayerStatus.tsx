import type { GameState } from "@boardgames/core/games/exploding-kittens/types";
import { AI_STRATEGY_LABELS } from "@boardgames/core/games/exploding-kittens/types";

interface PlayerStatusProps {
  state: GameState;
}

export default function PlayerStatus({ state }: PlayerStatusProps) {
  return (
    <div className="flex flex-wrap gap-3">
      {state.players.map((player) => {
        const isCurrent = player.index === state.currentPlayerIndex;
        const isHuman = player.type === "human";

        return (
          <div
            key={player.index}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
              !player.alive
                ? "bg-surface-800/50 text-fg-disabled line-through"
                : isCurrent
                  ? "bg-indigo-900/60 text-white ring-1 ring-accent-500"
                  : "bg-surface-800/60 text-fg-secondary"
            }`}
          >
            <span className="font-medium">{isHuman ? "You" : `AI ${player.index}`}</span>
            {!isHuman && player.aiStrategy && (
              <span className="text-3xs text-fg-muted">
                ({AI_STRATEGY_LABELS[player.aiStrategy]})
              </span>
            )}
            {player.alive ? (
              <span className="rounded-full bg-surface-700 px-2 py-0.5 text-xs">
                {player.hand.length} cards
              </span>
            ) : (
              <span className="text-xs">💀</span>
            )}
            {isCurrent && player.alive && (
              <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
            )}
          </div>
        );
      })}

      <div className="flex items-center gap-2 text-xs text-fg-muted">
        <span>Turn {state.turnCount}</span>
        {state.turnsRemaining > 1 && (
          <span className="text-amber-400">({state.turnsRemaining} turns remaining)</span>
        )}
      </div>
    </div>
  );
}
