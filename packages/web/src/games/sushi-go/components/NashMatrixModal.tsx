import type { NashActionLabel, NashAnalysis } from "@boardgames/core/games/sushi-go/ai/nash";
import { CARD_COLORS } from "@boardgames/core/games/sushi-go/types";
import { Modal } from "../../../components/ui/Modal";

interface NashMatrixModalProps {
  matrix: NashAnalysis;
  turn: number;
  onClose: () => void;
}

export default function NashMatrixModal({ matrix, turn, onClose }: NashMatrixModalProps) {
  const { p1Actions, p2Actions, payoffs, p1Strategy, p2Strategy, gameValue } = matrix;

  return (
    <Modal
      onClose={onClose}
      title="Nash Equilibrium Matrix"
      titleClassName="text-base font-semibold text-white"
      subheader={
        <p className="text-xs text-fg-muted">
          Turn {turn} &middot; {p1Actions.length}&times;{p2Actions.length} game &middot; Value:{" "}
          <span
            className={
              gameValue > 0
                ? "text-emerald-400"
                : gameValue < 0
                  ? "text-rose-400"
                  : "text-fg-secondary"
            }
          >
            {gameValue > 0 ? "+" : ""}
            {gameValue.toFixed(2)}
          </span>
        </p>
      }
      panelClassName="max-w-4xl max-h-[90vh] overflow-auto"
    >
      <div className="overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              {/* Top-left corner: labels */}
              <th className="border border-white/10 bg-surface-800/50 px-2 py-1.5 text-left text-3xs text-fg-muted">
                <div>AI &darr; / Opp &rarr;</div>
              </th>
              {p2Actions.map((action, j) => (
                <th
                  key={action.label}
                  className="border border-white/10 bg-surface-800/50 px-2 py-1.5 text-center font-normal"
                >
                  <ActionCell action={action} prob={p2Strategy[j]} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {p1Actions.map((action, i) => (
              <tr key={action.label}>
                <td className="border border-white/10 bg-surface-800/50 px-2 py-1.5">
                  <ActionCell action={action} prob={p1Strategy[i]} />
                </td>
                {payoffs[i].map((value, j) => (
                  <td
                    key={p2Actions[j].label}
                    className={`border border-white/10 px-2 py-1.5 text-center tabular-nums ${cellBgClass(p1Strategy[i], p2Strategy[j])}`}
                  >
                    <span
                      className={
                        value > 0.5
                          ? "text-emerald-400"
                          : value < -0.5
                            ? "text-rose-400"
                            : "text-fg-secondary"
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
      <div className="border-t border-white/10 pt-3">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-3xs text-fg-muted">
          <span>Cell values = expected score advantage for AI (positive = AI leads)</span>
          <span>
            <span className="inline-block h-2 w-2 rounded-sm bg-purple-500/20" /> = equilibrium play
            (both players mix with shown %)
          </span>
        </div>
      </div>
    </Modal>
  );
}

function ActionCell({ action, prob }: { action: NashActionLabel; prob: number }) {
  const pct = (prob * 100).toFixed(0);
  const isActive = prob > 0.01;
  const color = action.cards[0] ? CARD_COLORS[action.cards[0]] : undefined;

  return (
    <div className="flex flex-col items-center gap-0.5">
      <span
        className={`text-2xs leading-tight ${isActive ? "font-medium text-fg-secondary" : "text-fg-muted"}`}
        style={isActive && color ? { color } : undefined}
      >
        {action.label}
      </span>
      <span
        className={`text-3xs tabular-nums ${isActive ? "font-semibold text-purple-400" : "text-fg-disabled"}`}
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
