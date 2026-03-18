import type { AIEngine } from "../logic/types";
import { AI_ENGINE_DESCRIPTIONS, AI_ENGINE_LABELS } from "../logic/types";

const ENGINES: AIEngine[] = ["ismcts-v3", "ismcts-v2", "ismcts-v1"];

interface AISelectProps {
  onSelect: (engine: AIEngine) => void;
  onViewTournament: () => void;
}

export default function AISelect({ onSelect, onViewTournament }: AISelectProps) {
  return (
    <div className="flex h-[60vh] flex-col items-center justify-center gap-8">
      <div className="text-center">
        <h2 className="text-4xl font-extrabold text-white">Lost Cities</h2>
        <p className="mt-3 max-w-md text-gray-400">
          Build expedition routes by placing cards in ascending order. Wagers multiply your gains —
          or losses.
        </p>
      </div>

      <div className="flex flex-col gap-4 w-full max-w-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500 text-center">
          Choose AI Opponent
        </h3>

        {ENGINES.map((engine) => (
          <button
            type="button"
            key={engine}
            onClick={() => onSelect(engine)}
            className="group flex flex-col gap-2 rounded-xl border border-gray-700 bg-gray-800/60 px-6 py-5 text-left transition hover:border-indigo-500 hover:bg-gray-800"
          >
            <span className="text-lg font-bold text-white group-hover:text-indigo-400 transition-colors">
              {AI_ENGINE_LABELS[engine]}
            </span>
            <span className="text-sm text-gray-400 leading-relaxed">
              {AI_ENGINE_DESCRIPTIONS[engine]}
            </span>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onViewTournament}
        className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors underline underline-offset-4"
      >
        View AI vs AI Tournament
      </button>
    </div>
  );
}
