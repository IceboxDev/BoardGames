import type { StrategyId } from "@boardgames/core/games/sushi-go/ai/strategy";
import { ALL_STRATEGIES } from "@boardgames/core/games/sushi-go/ai/strategy";
import { useState } from "react";
import {
  OptionCard,
  SectionLabel,
  SetupHeader,
  SetupLayout,
  ToggleGroup,
} from "../../../components/setup";

interface SetupScreenProps {
  onStart: (playerCount: number, strategyId: StrategyId) => void;
}

const PLAYER_OPTIONS = [2, 3, 4, 5] as const;

const STRATEGY_ACCENT: Record<StrategyId, { color: string; badge: string; stars: number }> = {
  nash: {
    color: "#a855f7",
    badge: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
    stars: 4,
  },
  minimax: {
    color: "#ef4444",
    badge: "bg-red-500/15 text-red-400 ring-red-500/30",
    stars: 3,
  },
  random: {
    color: "#22c55e",
    badge: "bg-green-500/15 text-green-400 ring-green-500/30",
    stars: 1,
  },
};

const DIFFICULTY: Record<StrategyId, string> = {
  nash: "Expert",
  minimax: "Hard",
  random: "Easy",
};

export default function SetupScreen({ onStart }: SetupScreenProps) {
  const [playerCount, setPlayerCount] = useState(2);
  const [strategyId, setStrategyId] = useState<StrategyId>("nash");

  return (
    <SetupLayout>
      <SetupHeader title="Sushi Go!" subtitle="Choose how many players and your AI opponent" />

      <div className="mx-auto w-full max-w-sm space-y-6">
        <div>
          <SectionLabel>Players</SectionLabel>
          <ToggleGroup
            options={PLAYER_OPTIONS.map((n) => ({ value: n, label: String(n) }))}
            value={playerCount}
            onChange={setPlayerCount}
          />
          <p className="mt-1.5 text-xs text-gray-500">
            You + {playerCount - 1} bot{playerCount > 2 ? "s" : ""}
            {playerCount > 2 ? " (random picks)" : ""}
          </p>
        </div>
      </div>

      {playerCount === 2 && (
        <>
          <SectionLabel>Choose your opponent</SectionLabel>

          <div className="mb-8 grid w-full max-w-3xl grid-cols-3 gap-2 sm:gap-4">
            {ALL_STRATEGIES.map((strat) => {
              const meta = STRATEGY_ACCENT[strat.id];
              return (
                <OptionCard
                  key={strat.id}
                  accentColor={meta.color}
                  selected={strategyId === strat.id}
                  className="min-w-0 !px-2 !py-3 sm:!px-4 sm:!py-5"
                  onClick={() => setStrategyId(strat.id)}
                >
                  <div className="mb-1.5 flex items-start justify-between gap-0.5 sm:mb-3">
                    <span
                      className={`inline-flex items-center rounded-full px-1 py-0.5 text-[8px] font-semibold uppercase tracking-tight ring-1 ring-inset sm:px-2.5 sm:text-[10px] sm:tracking-wider ${meta.badge}`}
                    >
                      {DIFFICULTY[strat.id]}
                    </span>
                    <div className="flex shrink-0 gap-px sm:gap-0.5">
                      {[1, 2, 3, 4].map((n) => (
                        <svg
                          key={n}
                          viewBox="0 0 20 20"
                          aria-hidden="true"
                          fill={n <= meta.stars ? meta.color : "currentColor"}
                          className={`h-2.5 w-2.5 sm:h-3.5 sm:w-3.5 ${n <= meta.stars ? "" : "text-gray-700"}`}
                        >
                          <path
                            fillRule="evenodd"
                            d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z"
                            clipRule="evenodd"
                          />
                        </svg>
                      ))}
                    </div>
                  </div>

                  <span className="mb-0.5 block text-[11px] font-bold leading-tight text-white sm:mb-1 sm:text-lg">
                    {strat.label}
                  </span>

                  <span className="line-clamp-4 text-[9px] leading-snug text-gray-400 sm:line-clamp-none sm:text-sm sm:leading-relaxed">
                    {strat.description}
                  </span>
                </OptionCard>
              );
            })}
          </div>
        </>
      )}

      <div className="flex justify-center pt-2">
        <button
          type="button"
          onClick={() => onStart(playerCount, strategyId)}
          className="rounded-xl bg-emerald-600 px-8 py-3 font-semibold text-white transition hover:bg-emerald-500"
        >
          Start Game
        </button>
      </div>
    </SetupLayout>
  );
}
