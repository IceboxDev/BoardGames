import { scorePlayer } from "../logic/scoring";
import type { Expeditions } from "../logic/types";

interface ScorePanelProps {
  playerExpeditions: Expeditions;
  aiExpeditions: Expeditions;
  drawPileCount: number;
  turnCount: number;
}

export default function ScorePanel({
  playerExpeditions,
  aiExpeditions,
  drawPileCount,
  turnCount,
}: ScorePanelProps) {
  const playerScore = scorePlayer(playerExpeditions);
  const aiScore = scorePlayer(aiExpeditions);
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
