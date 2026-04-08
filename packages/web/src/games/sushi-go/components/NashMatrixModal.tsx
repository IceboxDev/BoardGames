import type { NashActionLabel, NashAnalysis } from "@boardgames/core/games/sushi-go/ai/nash";
import { CARD_COLORS } from "@boardgames/core/games/sushi-go/types";
import { useCallback } from "react";

interface NashMatrixModalProps {
  matrix: NashAnalysis;
  turn: number;
  onClose: () => void;
}

export default function NashMatrixModal({ matrix, turn, onClose }: NashMatrixModalProps) {
  const { p1Actions, p2Actions, payoffs, p1Strategy, p2Strategy, gameValue } = matrix;

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss pattern
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop dismiss pattern
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={handleBackdropClick}
    >
      <div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-xl border border-gray-700 bg-gray-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-700 px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-200">Nash Equilibrium Matrix</h2>
            <p className="text-xs text-gray-500">
              Turn {turn} &middot; {p1Actions.length}&times;{p2Actions.length} game &middot; Value:{" "}
              <span
                className={
                  gameValue > 0
                    ? "text-green-400"
                    : gameValue < 0
                      ? "text-red-400"
                      : "text-gray-400"
                }
              >
                {gameValue > 0 ? "+" : ""}
                {gameValue.toFixed(2)}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-700 px-3 py-1 text-xs text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-300"
          >
            Close
          </button>
        </div>

        {/* Matrix table */}
        <div className="overflow-auto p-4">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                {/* Top-left corner: labels */}
                <th className="border border-gray-700 bg-gray-800/50 px-2 py-1.5 text-left text-[10px] text-gray-500">
                  <div>AI &darr; / Opp &rarr;</div>
                </th>
                {p2Actions.map((action, j) => (
                  <th
                    key={action.label}
                    className="border border-gray-700 bg-gray-800/50 px-2 py-1.5 text-center font-normal"
                  >
                    <ActionCell action={action} prob={p2Strategy[j]} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {p1Actions.map((action, i) => (
                <tr key={action.label}>
                  <td className="border border-gray-700 bg-gray-800/50 px-2 py-1.5">
                    <ActionCell action={action} prob={p1Strategy[i]} />
                  </td>
                  {payoffs[i].map((value, j) => (
                    <td
                      key={p2Actions[j].label}
                      className={`border border-gray-700 px-2 py-1.5 text-center tabular-nums ${cellBgClass(p1Strategy[i], p2Strategy[j])}`}
                    >
                      <span
                        className={
                          value > 0.5
                            ? "text-green-400"
                            : value < -0.5
                              ? "text-red-400"
                              : "text-gray-400"
                        }
                      >
                        {value > 0 ? "+" : ""}
                        {value.toFixed(1)}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="border-t border-gray-700 px-5 py-3">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-[10px] text-gray-500">
            <span>Cell values = expected score advantage for AI (positive = AI leads)</span>
            <span>
              <span className="inline-block h-2 w-2 rounded-sm bg-purple-500/20" /> = equilibrium
              play (both players mix with shown %)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionCell({ action, prob }: { action: NashActionLabel; prob: number }) {
  const pct = (prob * 100).toFixed(0);
  const isActive = prob > 0.01;
  const color = action.cards[0] ? CARD_COLORS[action.cards[0]] : undefined;

  return (
    <div className="flex flex-col items-center gap-0.5">
      <span
        className={`text-[11px] leading-tight ${isActive ? "font-medium text-gray-200" : "text-gray-500"}`}
        style={isActive && color ? { color } : undefined}
      >
        {action.label}
      </span>
      <span
        className={`text-[10px] tabular-nums ${isActive ? "font-semibold text-purple-400" : "text-gray-600"}`}
      >
        {pct}%
      </span>
    </div>
  );
}

function cellBgClass(p1Prob: number, p2Prob: number): string {
  // Highlight cells that are part of the equilibrium support
  if (p1Prob > 0.01 && p2Prob > 0.01) {
    return "bg-purple-500/10";
  }
  return "";
}
