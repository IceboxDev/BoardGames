import type { ActionLogEntry } from "@boardgames/core/games/sushi-go/types";
import { AnimatePresence, motion } from "framer-motion";

interface RoundEndOverlayProps {
  entry: ActionLogEntry;
  playerCount: number;
  myIndex: number;
  onContinue: () => void;
}

const CATEGORIES = [
  { key: "maki" as const, label: "Maki Rolls", emoji: "🍣" },
  { key: "tempura" as const, label: "Tempura", emoji: "🍤" },
  { key: "sashimi" as const, label: "Sashimi", emoji: "🐟" },
  { key: "dumpling" as const, label: "Dumpling", emoji: "🥟" },
  { key: "nigiri" as const, label: "Nigiri", emoji: "🍱" },
];

function playerName(i: number, myIndex: number): string {
  return i === myIndex ? "You" : `P${i + 1}`;
}

export default function RoundEndOverlay({
  entry,
  playerCount,
  myIndex,
  onContinue,
}: RoundEndOverlayProps) {
  const scores = entry.categoryScores;
  const roundScores = entry.scores;
  if (!scores || !roundScores) return null;

  const maxTotal = Math.max(...roundScores);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 25, delay: 0.1 }}
          className="mx-4 w-full max-w-md rounded-xl border border-orange-500/20 bg-gray-900/95 p-4 shadow-2xl"
        >
          <h2 className="mb-3 text-center text-lg font-bold text-white">
            Round {entry.round} Complete
          </h2>

          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500">
                <th className="pb-1.5 text-left font-medium" />
                {CATEGORIES.map((c) => (
                  <th key={c.key} className="pb-1.5 text-center font-medium" title={c.label}>
                    <span className="cursor-help">{c.emoji}</span>
                  </th>
                ))}
                <th className="pb-1.5 text-right font-bold">Total</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: playerCount }).map((_, pi) => {
                const ps = scores[pi];
                const isYou = pi === myIndex;
                const isWinner = roundScores[pi] === maxTotal;
                return (
                  <tr
                    key={`p-${playerName(pi, myIndex)}`}
                    className={isYou ? "font-semibold text-orange-300" : "text-gray-300"}
                  >
                    <td className="py-1.5 pr-2 text-left">
                      {playerName(pi, myIndex)}
                      {isWinner ? " 👑" : ""}
                    </td>
                    {CATEGORIES.map((cat) => (
                      <td
                        key={cat.key}
                        className={`py-1.5 text-center tabular-nums ${ps[cat.key] === 0 ? "opacity-25" : ""}`}
                      >
                        {ps[cat.key]}
                      </td>
                    ))}
                    <td className="py-1.5 text-right font-bold tabular-nums">{roundScores[pi]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Maki roll detail line */}
          {entry.makiTotals?.some((m) => m > 0) && (
            <div className="mt-2 text-[10px] text-gray-500">
              Maki rolls:{" "}
              {Array.from({ length: playerCount })
                .map((_, i) => `${playerName(i, myIndex)}: ${entry.makiTotals?.[i] ?? 0}`)
                .join(", ")}
            </div>
          )}

          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={onContinue}
              className="rounded-lg bg-orange-600 px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-500"
            >
              {entry.round >= 3 ? "See Final Results" : `Start Round ${entry.round + 1}`}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
