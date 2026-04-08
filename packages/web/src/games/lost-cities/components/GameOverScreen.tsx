import type { AIEngine, PlayerScore } from "@boardgames/core/games/lost-cities/types";
import {
  AI_ENGINE_LABELS,
  COLOR_HEX,
  COLOR_LABELS,
  EXPEDITION_COLORS,
} from "@boardgames/core/games/lost-cities/types";
import { GameOverLayout } from "../../../components/game-over";

interface GameOverScreenProps {
  scores: [PlayerScore, PlayerScore];
  aiEngine: AIEngine;
  onPlayAgain: () => void;
  onChangeAI: () => void;
  onDownloadLog?: () => void;
  onViewReplay?: () => void;
}

export default function GameOverScreen({
  scores,
  aiEngine,
  onPlayAgain,
  onChangeAI,
  onDownloadLog,
  onViewReplay,
}: GameOverScreenProps) {
  const playerScore = scores[0];
  const aiScore = scores[1];
  const diff = playerScore.total - aiScore.total;
  const won = diff > 0;
  const tied = diff === 0;

  const actions: { label: string; variant: "primary" | "secondary"; onClick: () => void }[] = [
    { label: "Play Again", variant: "primary", onClick: onPlayAgain },
    { label: "Change AI", variant: "secondary", onClick: onChangeAI },
  ];
  if (onViewReplay) {
    actions.push({ label: "View Replay", variant: "secondary", onClick: onViewReplay });
  }
  if (onDownloadLog) {
    actions.push({ label: "Download Game Log", variant: "secondary", onClick: onDownloadLog });
  }

  return (
    <GameOverLayout
      headline={won ? "You Win!" : tied ? "It's a Tie!" : "AI Wins!"}
      headlineColor={won ? "win" : tied ? "draw" : "lose"}
      actions={actions}
    >
      <div className="space-y-6">
        {/* Score summary */}
        <div className="flex justify-center gap-8 text-center">
          <div>
            <div className="text-sm text-gray-400">Your Score</div>
            <div className="text-3xl font-bold text-white">{playerScore.total}</div>
          </div>
          <div className="flex items-end pb-2">
            <span
              className={[
                "text-sm font-bold",
                diff > 0 ? "text-green-400" : diff < 0 ? "text-red-400" : "text-gray-500",
              ].join(" ")}
            >
              {diff > 0 ? "+" : ""}
              {diff}
            </span>
          </div>
          <div>
            <div className="text-sm text-gray-400">AI Score</div>
            <div className="text-3xl font-bold text-white">{aiScore.total}</div>
          </div>
        </div>

        {/* Per-expedition breakdown */}
        <div className="w-full">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500">
                <th className="py-1 text-left font-medium">Expedition</th>
                <th className="py-1 text-right font-medium">You</th>
                <th className="w-12 py-1 text-center font-medium" />
                <th className="py-1 text-right font-medium">AI</th>
              </tr>
            </thead>
            <tbody>
              {EXPEDITION_COLORS.map((color) => {
                const pe = playerScore.expeditions.find((e) => e.color === color);
                const ae = aiScore.expeditions.find((e) => e.color === color);
                if (!pe || !ae) return null;
                const hex = COLOR_HEX[color];

                return (
                  <tr key={color} className="border-b border-gray-800/50">
                    <td className="py-1.5">
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: hex }}
                        />
                        <span className="text-gray-300">{COLOR_LABELS[color]}</span>
                      </span>
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {pe.started ? (
                        <span className="font-medium text-white">
                          {pe.total}
                          {pe.wagerMultiplier > 1 && (
                            <span className="ml-1 text-xs text-gray-500">
                              x{pe.wagerMultiplier}
                            </span>
                          )}
                          {pe.lengthBonus > 0 && (
                            <span className="ml-1 text-xs text-green-500">+20</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-gray-600">&mdash;</span>
                      )}
                    </td>
                    <td className="py-1.5 text-center">
                      {pe.started || ae.started ? (
                        <span
                          className={[
                            "text-xs font-bold",
                            pe.total > ae.total
                              ? "text-green-500"
                              : pe.total < ae.total
                                ? "text-red-500"
                                : "text-gray-600",
                          ].join(" ")}
                        >
                          {pe.total > ae.total ? "\u25B2" : pe.total < ae.total ? "\u25BC" : "="}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {ae.started ? (
                        <span className="font-medium text-white">
                          {ae.total}
                          {ae.wagerMultiplier > 1 && (
                            <span className="ml-1 text-xs text-gray-500">
                              x{ae.wagerMultiplier}
                            </span>
                          )}
                          {ae.lengthBonus > 0 && (
                            <span className="ml-1 text-xs text-green-500">+20</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-gray-600">&mdash;</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              <tr className="font-bold">
                <td className="py-2 text-gray-300">Total</td>
                <td className="py-2 text-right text-white">{playerScore.total}</td>
                <td />
                <td className="py-2 text-right text-white">{aiScore.total}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="text-center text-xs text-gray-500">
          Opponent: <span className="font-medium text-gray-400">{AI_ENGINE_LABELS[aiEngine]}</span>
        </p>
      </div>
    </GameOverLayout>
  );
}
