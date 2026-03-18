import { useState } from "react";
import type { AIStrategyId } from "../logic/types";
import { AI_STRATEGY_DESCRIPTIONS, AI_STRATEGY_LABELS } from "../logic/types";

interface SetupScreenProps {
  onStart: (playerCount: number, strategies: (AIStrategyId | null)[]) => void;
  onTournament: () => void;
}

const STRATEGY_OPTIONS: AIStrategyId[] = ["random", "heuristic-v1", "ismcts-v1"];

export default function SetupScreen({ onStart, onTournament }: SetupScreenProps) {
  const [playerCount, setPlayerCount] = useState(2);
  const [aiStrategies, setAiStrategies] = useState<AIStrategyId[]>(Array(4).fill("heuristic-v1"));

  function handleStart() {
    const strategies: (AIStrategyId | null)[] = [null];
    for (let i = 1; i < playerCount; i++) {
      strategies.push(aiStrategies[i - 1]);
    }
    onStart(playerCount, strategies);
  }

  function updateStrategy(index: number, strategy: AIStrategyId) {
    setAiStrategies((prev) => {
      const next = [...prev];
      next[index] = strategy;
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h3 className="mb-3 text-lg font-semibold text-white">Game Setup</h3>

        <div className="mb-4">
          <fieldset className="border-0 p-0 m-0">
            <legend className="mb-1 block text-sm text-gray-400">Number of Players</legend>
            <div className="flex gap-2">
              {[2, 3, 4, 5].map((n) => (
                <button
                  type="button"
                  key={n}
                  onClick={() => setPlayerCount(n)}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                    playerCount === n
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  }`}
                >
                  {n} Players
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="space-y-3">
          <div className="rounded-lg bg-gray-800/60 px-3 py-2 text-sm text-gray-300">
            Player 1: <span className="font-medium text-white">You</span>
          </div>

          {Array.from({ length: playerCount - 1 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static list / chart data points don't reorder
            <div key={i} className="rounded-lg bg-gray-800/60 px-3 py-2">
              <p className="mb-1 text-sm text-gray-300">
                Player {i + 2}: <span className="text-gray-500">AI</span>
              </p>
              <select
                value={aiStrategies[i]}
                onChange={(e) => updateStrategy(i, e.target.value as AIStrategyId)}
                className="w-full rounded bg-gray-700 px-2 py-1.5 text-sm text-white"
              >
                {STRATEGY_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {AI_STRATEGY_LABELS[s]}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-gray-500">
                {AI_STRATEGY_DESCRIPTIONS[aiStrategies[i]]}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleStart}
          className="flex-1 rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          Start Game
        </button>
        <button
          type="button"
          onClick={onTournament}
          className="rounded-lg bg-gray-700 px-4 py-3 text-sm text-white transition hover:bg-gray-600"
        >
          AI Tournament
        </button>
      </div>
    </div>
  );
}
