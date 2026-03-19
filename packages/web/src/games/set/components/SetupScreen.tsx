import { SetupHeader, SetupLayout } from "../../../components/setup";

interface SetupScreenProps {
  onStart: () => void;
  onViewHighScores: () => void;
}

export default function SetupScreen({ onStart, onViewHighScores }: SetupScreenProps) {
  return (
    <SetupLayout>
      <SetupHeader
        title="Set"
        subtitle="Find groups of three cards where each attribute (shape, color, fill, count) is either all the same or all different across the three cards."
      />

      <p className="text-sm text-gray-500 mb-8">
        Cards are dealt one-by-one. Press{" "}
        <kbd className="rounded bg-gray-700 px-2 py-0.5 text-xs font-mono text-gray-300">Space</kbd>{" "}
        or the SET! button anytime you spot one — even mid-deal.
      </p>

      <button
        type="button"
        onClick={onStart}
        className="rounded-xl bg-indigo-600 px-8 py-3 font-semibold text-white transition hover:bg-indigo-500 mb-4"
      >
        Start Game
      </button>

      <button
        type="button"
        onClick={onViewHighScores}
        className="group flex items-center gap-3 rounded-xl border border-gray-700/60 bg-gray-800/30 px-6 py-3 transition-all hover:border-indigo-500/50 hover:bg-gray-800/60"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400 group-hover:bg-indigo-500/20 transition-colors">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path
              fillRule="evenodd"
              d="M10 1c-1.828 0-3.623.149-5.371.435a.75.75 0 00-.629.74v.659c0 2.457.82 4.776 2.312 6.644A17.1 17.1 0 009 11.874V15H7a.75.75 0 000 1.5h6a.75.75 0 000-1.5h-2v-3.126a17.1 17.1 0 002.688-2.396A11.413 11.413 0 0016 3.834v-.66a.75.75 0 00-.629-.739A33.668 33.668 0 0010 1zM5.5 3.06a31.17 31.17 0 019 0v.774a9.913 9.913 0 01-2.012 5.78A15.59 15.59 0 0110 11.96a15.59 15.59 0 01-2.488-2.346A9.913 9.913 0 015.5 3.834V3.06z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <span className="text-sm font-semibold text-white group-hover:text-indigo-300 transition-colors">
          High Scores
        </span>
      </button>
    </SetupLayout>
  );
}
