import type { AIStrategyId } from "@boardgames/core/games/durak/types";
import { AI_STRATEGY_DESCRIPTIONS, AI_STRATEGY_LABELS } from "@boardgames/core/games/durak/types";
import { OptionCard, SectionLabel, SetupHeader, SetupLayout } from "../../../components/setup";

const STRATEGIES: AIStrategyId[] = ["random", "heuristic-v1"];

const BOT_META: Record<
  AIStrategyId,
  { difficulty: string; stars: number; accent: string; badge: string }
> = {
  random: {
    difficulty: "Easy",
    stars: 1,
    accent: "#22c55e",
    badge: "bg-green-500/15 text-green-400 ring-green-500/30",
  },
  "heuristic-v1": {
    difficulty: "Medium",
    stars: 2,
    accent: "#f59e0b",
    badge: "bg-amber-500/15 text-amber-400 ring-amber-500/30",
  },
};

interface SetupScreenProps {
  onSelect: (strategy: AIStrategyId) => void;
}

export default function SetupScreen({ onSelect }: SetupScreenProps) {
  return (
    <SetupLayout>
      <SetupHeader
        title="Durak"
        subtitle="The classic Russian card game. Don't be the last one holding cards."
      />

      <SectionLabel>Choose your opponent</SectionLabel>

      <div className="mb-10 grid w-full min-w-0 max-w-6xl grid-cols-2 gap-2 sm:gap-4">
        {STRATEGIES.map((id) => {
          const meta = BOT_META[id];
          return (
            <OptionCard
              key={id}
              accentColor={meta.accent}
              className="min-w-0 !px-2 !py-3 sm:!px-4 sm:!py-5"
              onClick={() => onSelect(id)}
            >
              <div className="mb-1.5 flex items-start justify-between gap-0.5 sm:mb-3">
                <span
                  className={`inline-flex max-w-[4.5rem] items-center truncate rounded-full px-1 py-0.5 text-[8px] font-semibold uppercase tracking-tight ring-1 ring-inset sm:max-w-none sm:px-2.5 sm:text-[10px] sm:tracking-wider ${meta.badge}`}
                >
                  {meta.difficulty}
                </span>
                <div className="flex shrink-0 gap-px sm:gap-0.5">
                  {[1, 2].map((n) => (
                    <svg
                      key={n}
                      viewBox="0 0 20 20"
                      aria-hidden="true"
                      fill={n <= meta.stars ? meta.accent : "currentColor"}
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

              <span className="mb-0.5 block text-[11px] font-bold leading-tight text-white transition-colors group-hover:text-white sm:mb-1 sm:text-lg">
                {AI_STRATEGY_LABELS[id]}
              </span>

              <span className="line-clamp-4 text-[9px] leading-snug text-gray-400 sm:line-clamp-none sm:text-sm sm:leading-relaxed">
                {AI_STRATEGY_DESCRIPTIONS[id]}
              </span>

              <div className="mt-2 flex items-center gap-1 text-[10px] font-medium text-gray-600 transition-colors group-hover:text-gray-400 sm:mt-4 sm:gap-1.5 sm:text-xs">
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-2.5 w-2.5 sm:h-3.5 sm:w-3.5"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M2 10a8 8 0 1116 0 8 8 0 01-16 0zm6.39-2.908a.75.75 0 01.766.027l3.5 2.25a.75.75 0 010 1.262l-3.5 2.25A.75.75 0 018 12.25v-4.5a.75.75 0 01.39-.658z"
                    clipRule="evenodd"
                  />
                </svg>
                Play
              </div>
            </OptionCard>
          );
        })}
      </div>
    </SetupLayout>
  );
}
