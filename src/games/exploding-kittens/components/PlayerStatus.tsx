import type { GameState } from "../logic/types";
import { AI_STRATEGY_LABELS } from "../logic/types";

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
                ? "bg-gray-800/50 text-gray-600 line-through"
                : isCurrent
                  ? "bg-indigo-900/60 text-white ring-1 ring-indigo-500"
                  : "bg-gray-800/60 text-gray-300"
            }`}
          >
            <span className="font-medium">{isHuman ? "You" : `AI ${player.index}`}</span>
            {!isHuman && player.aiStrategy && (
              <span className="text-[10px] text-gray-500">
                ({AI_STRATEGY_LABELS[player.aiStrategy]})
              </span>
            )}
            {player.alive ? (
              <span className="rounded-full bg-gray-700 px-2 py-0.5 text-xs">
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

      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span>Turn {state.turnCount}</span>
        {state.turnsRemaining > 1 && (
          <span className="text-amber-400">({state.turnsRemaining} turns remaining)</span>
        )}
      </div>
    </div>
  );
}
