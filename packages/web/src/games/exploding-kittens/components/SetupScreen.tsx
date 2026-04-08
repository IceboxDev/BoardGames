import type { AIStrategyId } from "@boardgames/core/games/exploding-kittens/types";
import {
  AI_STRATEGY_DESCRIPTIONS,
  AI_STRATEGY_LABELS,
} from "@boardgames/core/games/exploding-kittens/types";
import { useState } from "react";
import {
  OptionCard,
  SectionLabel,
  SetupHeader,
  SetupLayout,
  ToggleGroup,
} from "../../../components/setup";

interface SetupScreenProps {
  onStart: (playerCount: number, strategies: (AIStrategyId | null)[]) => void;
}

const STRATEGY_OPTIONS: AIStrategyId[] = ["random", "heuristic-v1", "ismcts-v1"];

const PLAYER_OPTIONS = [2, 3, 4, 5].map((n) => ({
  value: n,
  label: `${n} Players`,
}));

const STRATEGY_ACCENT: Record<AIStrategyId, string> = {
  random: "#6b7280",
  "heuristic-v1": "#f59e0b",
  "ismcts-v1": "#ef4444",
};

export default function SetupScreen({ onStart }: SetupScreenProps) {
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
    <SetupLayout>
      <SetupHeader
        title="Exploding Kittens"
        subtitle="Probability and bluffing dynamics in a strategic card game. Don't draw the exploding kitten."
      />

      <div className="w-full max-w-3xl space-y-8">
        <div>
          <SectionLabel>Number of players</SectionLabel>
          <ToggleGroup options={PLAYER_OPTIONS} value={playerCount} onChange={setPlayerCount} />
        </div>

        <div>
          <SectionLabel>Players</SectionLabel>
          <div className="space-y-3">
            <OptionCard accentColor="#818cf8">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-white">Player 1</span>
                <span className="inline-flex items-center rounded-full bg-indigo-500/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-400 ring-1 ring-inset ring-indigo-500/30">
                  You
                </span>
              </div>
            </OptionCard>

            {Array.from({ length: playerCount - 1 }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: AI slots are positional, no stable ID
              <OptionCard key={`ai-${i}`} accentColor={STRATEGY_ACCENT[aiStrategies[i]]}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold text-white">Player {i + 2}</span>
                  <span className="inline-flex items-center rounded-full bg-gray-500/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 ring-1 ring-inset ring-gray-500/30">
                    AI
                  </span>
                </div>
                <select
                  value={aiStrategies[i]}
                  onChange={(e) => updateStrategy(i, e.target.value as AIStrategyId)}
                  className="w-full rounded-lg bg-gray-700/60 px-3 py-2 text-sm text-white border border-gray-600/50 focus:outline-none focus:border-indigo-500/50"
                >
                  {STRATEGY_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {AI_STRATEGY_LABELS[s]}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-gray-500 leading-relaxed">
                  {AI_STRATEGY_DESCRIPTIONS[aiStrategies[i]]}
                </p>
              </OptionCard>
            ))}
          </div>
        </div>

        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={handleStart}
            className="rounded-xl bg-emerald-600 px-8 py-3 font-semibold text-white transition hover:bg-emerald-500"
          >
            Start Game
          </button>
        </div>
      </div>
    </SetupLayout>
  );
}
