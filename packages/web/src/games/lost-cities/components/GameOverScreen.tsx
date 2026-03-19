import type { AIEngine, PlayerScore } from "@boardgames/core/games/lost-cities/types";
import {
  AI_ENGINE_LABELS,
  COLOR_HEX,
  COLOR_LABELS,
  EXPEDITION_COLORS,
} from "@boardgames/core/games/lost-cities/types";

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

  return (
    <div className="flex flex-col items-center gap-6 py-8 animate-card-enter">
      <h2
        className={[
          "text-3xl font-extrabold",
          won ? "text-green-400" : tied ? "text-gray-300" : "text-red-400",
        ].join(" ")}
      >
        {won ? "You Win!" : tied ? "It's a Tie!" : "AI Wins!"}
      </h2>

      <div className="flex gap-8 text-center">
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
      <div className="w-full max-w-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 border-b border-gray-800">
              <th className="text-left py-1 font-medium">Expedition</th>
              <th className="text-right py-1 font-medium">You</th>
              <th className="text-center py-1 font-medium w-12"></th>
              <th className="text-right py-1 font-medium">AI</th>
            </tr>
          </thead>
          <tbody>
            {EXPEDITION_COLORS.map((color) => {
              const pe = playerScore.expeditions.find((e) => e.color === color)!;
              const ae = aiScore.expeditions.find((e) => e.color === color)!;
              const hex = COLOR_HEX[color];

              return (
                <tr key={color} className="border-b border-gray-800/50">
                  <td className="py-1.5">
                    <span className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full inline-block"
                        style={{ backgroundColor: hex }}
                      />
                      <span className="text-gray-300">{COLOR_LABELS[color]}</span>
                    </span>
                  </td>
                  <td className="text-right py-1.5 tabular-nums">
                    {pe.started ? (
                      <span className="text-white font-medium">
                        {pe.total}
                        {pe.wagerMultiplier > 1 && (
                          <span className="text-gray-500 text-xs ml-1">×{pe.wagerMultiplier}</span>
                        )}
                        {pe.lengthBonus > 0 && (
                          <span className="text-green-500 text-xs ml-1">+20</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>
                  <td className="text-center py-1.5">
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
                        {pe.total > ae.total ? "▲" : pe.total < ae.total ? "▼" : "="}
                      </span>
                    ) : null}
                  </td>
                  <td className="text-right py-1.5 tabular-nums">
                    {ae.started ? (
                      <span className="text-white font-medium">
                        {ae.total}
                        {ae.wagerMultiplier > 1 && (
                          <span className="text-gray-500 text-xs ml-1">×{ae.wagerMultiplier}</span>
                        )}
                        {ae.lengthBonus > 0 && (
                          <span className="text-green-500 text-xs ml-1">+20</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            <tr className="font-bold">
              <td className="py-2 text-gray-300">Total</td>
              <td className="text-right py-2 text-white">{playerScore.total}</td>
              <td></td>
              <td className="text-right py-2 text-white">{aiScore.total}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500">
        Opponent: <span className="font-medium text-gray-400">{AI_ENGINE_LABELS[aiEngine]}</span>
      </p>

      <div className="flex flex-wrap gap-3 mt-2 justify-center">
        <button
          type="button"
          onClick={onPlayAgain}
          className="rounded-xl bg-indigo-600 px-6 py-2.5 font-semibold text-white transition hover:bg-indigo-500"
        >
          Play Again
        </button>
        <button
          type="button"
          onClick={onChangeAI}
          className="rounded-xl bg-gray-700 px-6 py-2.5 font-semibold text-gray-300 transition hover:bg-gray-600"
        >
          Change AI
        </button>
        {onViewReplay && (
          <button
            type="button"
            onClick={onViewReplay}
            className="rounded-xl bg-gray-700 px-6 py-2.5 font-semibold text-gray-300 transition hover:bg-gray-600"
          >
            View Replay
          </button>
        )}
        {onDownloadLog && (
          <button
            type="button"
            onClick={onDownloadLog}
            className="rounded-xl bg-gray-700 px-6 py-2.5 font-semibold text-gray-300 transition hover:bg-gray-600"
          >
            Download Game Log
          </button>
        )}
      </div>
    </div>
  );
}
