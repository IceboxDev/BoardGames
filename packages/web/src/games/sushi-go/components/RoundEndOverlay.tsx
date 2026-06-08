import type { ActionLogEntry } from "@boardgames/core/games/sushi-go/types";
import { Button } from "../../../components/ui/Button";
import { Modal } from "../../../components/ui/Modal";

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
    <Modal
      onClose={onContinue}
      ariaLabel={`Round ${entry.round} complete`}
      title={`Round ${entry.round} Complete`}
      titleClassName="text-lg font-bold text-white"
      panelClassName="max-w-md"
      hideCloseButton
      closeOnBackdrop={false}
      closeOnEscape={false}
    >
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-white/10 text-fg-muted">
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
                className={isYou ? "font-semibold text-orange-300" : "text-fg-secondary"}
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
        <div className="text-3xs text-fg-muted">
          Maki rolls:{" "}
          {Array.from({ length: playerCount })
            .map((_, i) => `${playerName(i, myIndex)}: ${entry.makiTotals?.[i] ?? 0}`)
            .join(", ")}
        </div>
      )}

      <div className="flex justify-center">
        <Button
          variant="primary"
          size="md"
          onClick={onContinue}
          className="!bg-orange-600 hover:!bg-orange-500 !shadow-orange-500/20"
        >
          {entry.round >= 3 ? "See Final Results" : `Start Round ${entry.round + 1}`}
        </Button>
      </div>
    </Modal>
  );
}
