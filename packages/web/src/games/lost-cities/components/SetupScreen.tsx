import type { AIEngine } from "@boardgames/core/games/lost-cities/types";
import { AI_ENGINE_DESCRIPTIONS, AI_ENGINE_LABELS } from "@boardgames/core/games/lost-cities/types";
import { OptionCard, SectionLabel, SetupHeader, SetupLayout } from "../../../components/setup";

const ENGINES: AIEngine[] = ["ismcts-v1", "ismcts-v4", "ismcts-v5", "ismcts-v6"];

const BOT_META: Record<
  AIEngine,
  { difficulty: string; stars: number; accent: string; badge: string }
> = {
  "ismcts-v1": {
    difficulty: "Easy",
    stars: 1,
    accent: "#22c55e",
    badge: "bg-green-500/15 text-green-400 ring-green-500/30",
  },
  "ismcts-v4": {
    difficulty: "Medium",
    stars: 2,
    accent: "#f59e0b",
    badge: "bg-amber-500/15 text-amber-400 ring-amber-500/30",
  },
  "ismcts-v5": {
    difficulty: "Hard",
    stars: 3,
    accent: "#ef4444",
    badge: "bg-red-500/15 text-red-400 ring-red-500/30",
  },
  "ismcts-v6": {
    difficulty: "Hard+",
    stars: 4,
    accent: "#a855f7",
    badge: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  },
};

interface SetupScreenProps {
  onSelect: (engine: AIEngine) => void;
}

export default function SetupScreen({ onSelect }: SetupScreenProps) {
  return (
    <SetupLayout>
      <SetupHeader
        title="Lost Cities"
        subtitle="Build expedition routes by placing cards in ascending order. Wagers multiply your gains — or losses."
      />

      <SectionLabel>Choose your opponent</SectionLabel>

      <div className="mb-10 grid w-full min-w-0 max-w-6xl grid-cols-4 gap-2 sm:gap-4">
        {ENGINES.map((engine) => {
          const meta = BOT_META[engine];
          return (
            <OptionCard
              key={engine}
              accentColor={meta.accent}
              className="min-w-0 !px-2 !py-3 sm:!px-4 sm:!py-5"
              onClick={() => onSelect(engine)}
            >
              <div className="mb-1.5 flex items-start justify-between gap-0.5 sm:mb-3">
                <span
                  className={`inline-flex max-w-[4.5rem] items-center truncate rounded-full px-1 py-0.5 text-[8px] font-semibold uppercase tracking-tight ring-1 ring-inset sm:max-w-none sm:px-2.5 sm:text-[10px] sm:tracking-wider ${meta.badge}`}
                >
                  {meta.difficulty}
                </span>
                <div className="flex shrink-0 gap-px sm:gap-0.5">
                  {[1, 2, 3, 4].map((n) => (
                    <svg
                      key={n}
                      viewBox="0 0 20 20"
                      fill={n <= meta.stars ? meta.accent : "currentColor"}
                      className={`h-2.5 w-2.5 sm:h-3.5 sm:w-3.5 ${n <= meta.stars ? "" : "text-gray-700"}`}
                      aria-hidden="true"
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
                {AI_ENGINE_LABELS[engine]}
              </span>

              <span className="line-clamp-4 text-[9px] leading-snug text-gray-400 sm:line-clamp-none sm:text-sm sm:leading-relaxed">
                {AI_ENGINE_DESCRIPTIONS[engine]}
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
