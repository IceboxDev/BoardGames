import type { AIEngine } from "@boardgames/core/games/lost-cities/types";
import { AI_ENGINE_DESCRIPTIONS, AI_ENGINE_LABELS } from "@boardgames/core/games/lost-cities/types";
import { OptionCard, SectionLabel, SetupHeader, SetupLayout } from "../../../components/setup";

const ENGINES: AIEngine[] = ["ismcts-v1", "ismcts-v3", "ismcts-v4", "ismcts-v5"];

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
  "ismcts-v3": {
    difficulty: "Medium",
    stars: 2,
    accent: "#f59e0b",
    badge: "bg-amber-500/15 text-amber-400 ring-amber-500/30",
  },
  "ismcts-v4": {
    difficulty: "Hard",
    stars: 3,
    accent: "#ef4444",
    badge: "bg-red-500/15 text-red-400 ring-red-500/30",
  },
  "ismcts-v5": {
    difficulty: "Expert",
    stars: 4,
    accent: "#8b5cf6",
    badge: "bg-violet-500/15 text-violet-400 ring-violet-500/30",
  },
};

interface AISelectProps {
  onSelect: (engine: AIEngine) => void;
  onViewTournament: () => void;
  onViewMatchHistory: () => void;
}

export default function AISelect({
  onSelect,
  onViewTournament,
  onViewMatchHistory,
}: AISelectProps) {
  return (
    <SetupLayout>
      <SetupHeader
        title="Lost Cities"
        subtitle="Build expedition routes by placing cards in ascending order. Wagers multiply your gains — or losses."
      />

      <SectionLabel>Choose your opponent</SectionLabel>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-3xl mb-10">
        {ENGINES.map((engine) => {
          const meta = BOT_META[engine];
          return (
            <OptionCard key={engine} accentColor={meta.accent} onClick={() => onSelect(engine)}>
              <div className="flex items-center justify-between mb-3">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset ${meta.badge}`}
                >
                  {meta.difficulty}
                </span>
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4].map((n) => (
                    <svg
                      key={n}
                      viewBox="0 0 20 20"
                      fill={n <= meta.stars ? meta.accent : "currentColor"}
                      className={`h-3.5 w-3.5 ${n <= meta.stars ? "" : "text-gray-700"}`}
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

              <span className="text-lg font-bold text-white group-hover:text-white transition-colors mb-1">
                {AI_ENGINE_LABELS[engine]}
              </span>

              <span className="text-sm text-gray-400 leading-relaxed flex-1">
                {AI_ENGINE_DESCRIPTIONS[engine]}
              </span>

              <div className="mt-4 flex items-center gap-1.5 text-xs font-medium text-gray-600 group-hover:text-gray-400 transition-colors">
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
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

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={onViewMatchHistory}
          className="group flex items-center gap-3 rounded-xl border border-gray-700/60 bg-gray-800/30 px-6 py-4 transition-all hover:border-emerald-500/50 hover:bg-gray-800/60"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500/20 transition-colors">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="text-left">
            <div className="text-sm font-semibold text-white group-hover:text-emerald-300 transition-colors">
              Match History
            </div>
            <div className="text-xs text-gray-500">Review your past games</div>
          </div>
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4 text-gray-600 group-hover:text-gray-400 transition-colors ml-2"
          >
            <path
              fillRule="evenodd"
              d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        <button
          type="button"
          onClick={onViewTournament}
          className="group flex items-center gap-3 rounded-xl border border-gray-700/60 bg-gray-800/30 px-6 py-4 transition-all hover:border-indigo-500/50 hover:bg-gray-800/60"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400 group-hover:bg-indigo-500/20 transition-colors">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path
                fillRule="evenodd"
                d="M10 1c-1.828 0-3.623.149-5.371.435a.75.75 0 00-.629.74v.659c0 2.457.82 4.776 2.312 6.644A17.1 17.1 0 009 11.874V15H7a.75.75 0 000 1.5h6a.75.75 0 000-1.5h-2v-3.126a17.1 17.1 0 002.688-2.396A11.413 11.413 0 0016 3.834v-.66a.75.75 0 00-.629-.739A33.668 33.668 0 0010 1zM5.5 3.06a31.17 31.17 0 019 0v.774a9.913 9.913 0 01-2.012 5.78A15.59 15.59 0 0110 11.96a15.59 15.59 0 01-2.488-2.346A9.913 9.913 0 015.5 3.834V3.06z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="text-left">
            <div className="text-sm font-semibold text-white group-hover:text-indigo-300 transition-colors">
              AI Tournament
            </div>
            <div className="text-xs text-gray-500">Watch AI strategies battle each other</div>
          </div>
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4 text-gray-600 group-hover:text-gray-400 transition-colors ml-2"
          >
            <path
              fillRule="evenodd"
              d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
    </SetupLayout>
  );
}
