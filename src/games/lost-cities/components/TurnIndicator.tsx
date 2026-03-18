import type { Player, TurnPhase } from "../logic/types";

interface TurnIndicatorProps {
  currentPlayer: Player;
  turnPhase: TurnPhase;
  isGameOver: boolean;
}

export default function TurnIndicator({
  currentPlayer,
  turnPhase,
  isGameOver,
}: TurnIndicatorProps) {
  if (isGameOver) return null;

  const isHuman = currentPlayer === "human";

  const message = isHuman
    ? turnPhase === "play"
      ? "Select a card to play or discard"
      : "Draw a card from the pile or discard"
    : "AI is thinking\u2026";

  return (
    <div className="flex items-center justify-center gap-2 py-2">
      <span
        className={[
          "text-sm font-semibold transition-colors duration-300",
          isHuman ? "text-cyan-400" : "text-amber-400",
        ].join(" ")}
      >
        {isHuman ? "Your turn" : "AI turn"}
      </span>
      <span className="text-gray-500">·</span>
      <span className="text-sm text-gray-400">{message}</span>
      {!isHuman && (
        <span className="animate-pulse-glow w-2 h-2 rounded-full bg-amber-400 inline-block" />
      )}
    </div>
  );
}
