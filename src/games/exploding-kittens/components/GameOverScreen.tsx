import type { AIStrategyId, GameState } from "../logic/types";
import { AI_STRATEGY_LABELS } from "../logic/types";

interface GameOverScreenProps {
  state: GameState;
  onPlayAgain: () => void;
  onChangeSetup: () => void;
}

export default function GameOverScreen({ state, onPlayAgain, onChangeSetup }: GameOverScreenProps) {
  const winner = state.winner !== null ? state.players[state.winner] : null;

  const isHumanWin = winner?.type === "human";

  const eliminatedPlayers = state.actionLog
    .filter((e) => e.action === "exploded")
    .map((e) => e.playerIndex);

  return (
    <div className="mx-auto max-w-lg space-y-6 text-center">
      <div>
        <span className="text-5xl">{isHumanWin ? "🎉" : "💀"}</span>
        <h3 className="mt-3 text-2xl font-bold text-white">
          {isHumanWin ? "You Win!" : `AI ${state.winner} Wins!`}
        </h3>
        {winner && !isHumanWin && winner.aiStrategy && (
          <p className="mt-1 text-sm text-gray-400">
            Strategy: {AI_STRATEGY_LABELS[winner.aiStrategy as AIStrategyId]}
          </p>
        )}
        <p className="mt-1 text-sm text-gray-500">Game lasted {state.turnCount} turns</p>
      </div>

      <div className="rounded-xl bg-gray-800/60 p-4 text-left">
        <p className="mb-2 text-sm font-medium text-gray-300">Elimination Order</p>
        <div className="space-y-1">
          {eliminatedPlayers.map((pi, i) => {
            const p = state.players[pi];
            return (
              <div key={pi} className="flex items-center gap-2 text-sm text-gray-400">
                <span className="text-gray-600">{i + 1}.</span>
                <span>💀</span>
                <span>{p.type === "human" ? "You" : `AI ${pi}`}</span>
                {p.aiStrategy && (
                  <span className="text-xs text-gray-600">
                    ({AI_STRATEGY_LABELS[p.aiStrategy]})
                  </span>
                )}
              </div>
            );
          })}
          {winner && (
            <div className="flex items-center gap-2 text-sm text-emerald-400">
              <span className="text-gray-600">🏆</span>
              <span>👑</span>
              <span>{winner.type === "human" ? "You" : `AI ${winner.index}`}</span>
              <span className="text-xs text-gray-500">(survivor)</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-3 justify-center">
        <button
          type="button"
          onClick={onPlayAgain}
          className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          Play Again
        </button>
        <button
          type="button"
          onClick={onChangeSetup}
          className="rounded-lg bg-gray-700 px-6 py-2.5 text-sm text-white transition hover:bg-gray-600"
        >
          Change Setup
        </button>
      </div>
    </div>
  );
}
