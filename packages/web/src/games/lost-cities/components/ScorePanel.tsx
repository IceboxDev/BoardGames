import { scorePlayer } from "@boardgames/core/games/lost-cities/scoring";
import type { Expeditions } from "@boardgames/core/games/lost-cities/types";

interface ScorePanelProps {
  expeditions: [Expeditions, Expeditions];
  drawPileCount: number;
  turnCount: number;
}

export default function ScorePanel({ expeditions, drawPileCount, turnCount }: ScorePanelProps) {
  const playerScore = scorePlayer(expeditions[0]);
  const aiScore = scorePlayer(expeditions[1]);
  const diff = playerScore.total - aiScore.total;

  return (
    <div className="flex items-center justify-between text-xs text-gray-400 px-2">
      <div className="flex gap-3">
        <span>
          You: <span className="font-bold text-white">{playerScore.total}</span>
        </span>
        <span>
          AI: <span className="font-bold text-white">{aiScore.total}</span>
        </span>
        <span className={diff > 0 ? "text-green-400" : diff < 0 ? "text-red-400" : "text-gray-500"}>
          ({diff > 0 ? "+" : ""}
          {diff})
        </span>
      </div>
      <div className="flex gap-3">
        <span>Deck: {drawPileCount}</span>
        <span>Turn: {turnCount}</span>
      </div>
    </div>
  );
}
