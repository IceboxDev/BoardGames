import { scorePlayer } from "@boardgames/core/games/lost-cities/scoring";
import type { Expeditions } from "@boardgames/core/games/lost-cities/types";

interface ScorePanelProps {
  expeditions: [Expeditions, Expeditions];
  drawPileCount: number;
  turnCount: number;
  /** When set, replaces “You” / “AI” (e.g. tournament replay: [P0, P1]). */
  playerNames?: [string, string];
  compact?: boolean;
}

export default function ScorePanel({
  expeditions,
  drawPileCount,
  turnCount,
  playerNames,
  compact = false,
}: ScorePanelProps) {
  const playerScore = scorePlayer(expeditions[0]);
  const aiScore = scorePlayer(expeditions[1]);
  const diff = playerScore.total - aiScore.total;
  const name0 = playerNames?.[0] ?? "You";
  const name1 = playerNames?.[1] ?? "AI";

  return (
    <div
      className={`flex items-center justify-between text-gray-400 shrink-0 ${
        compact ? "text-[10px] px-1 gap-2" : "text-xs px-2 gap-3"
      }`}
    >
      <div className={`flex ${compact ? "gap-2 flex-wrap" : "gap-3"}`}>
        <span>
          {name0}: <span className="font-bold text-white">{playerScore.total}</span>
        </span>
        <span>
          {name1}: <span className="font-bold text-white">{aiScore.total}</span>
        </span>
        <span className={diff > 0 ? "text-green-400" : diff < 0 ? "text-red-400" : "text-gray-500"}>
          ({diff > 0 ? "+" : ""}
          {diff})
        </span>
      </div>
      <div className={`flex shrink-0 ${compact ? "gap-2" : "gap-3"}`}>
        <span>Deck: {drawPileCount}</span>
        <span>Turn: {turnCount}</span>
      </div>
    </div>
  );
}
