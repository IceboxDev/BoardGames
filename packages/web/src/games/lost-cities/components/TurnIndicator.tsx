import type { PlayerIndex, TurnPhase } from "@boardgames/core/games/lost-cities/types";

interface TurnIndicatorProps {
  currentPlayer: PlayerIndex;
  turnPhase: TurnPhase;
  isGameOver: boolean;
  /** Read-only label line (tournament replay). */
  readOnly?: boolean;
  /** With `readOnly`, names for player 0 / 1 (same as expeditions index). */
  playerNames?: [string, string];
  /** Less vertical padding (replay). */
  dense?: boolean;
  /** Show "Opponent" instead of "AI" labels. */
  isMultiplayer?: boolean;
}

export default function TurnIndicator({
  currentPlayer,
  turnPhase,
  isGameOver,
  readOnly = false,
  playerNames,
  dense = false,
  isMultiplayer = false,
}: TurnIndicatorProps) {
  if (isGameOver) return null;

  const isHuman = currentPlayer === 0;

  if (readOnly && playerNames) {
    const name = playerNames[currentPlayer];
    const phaseStr = turnPhase === "play" ? "Play phase" : "Draw phase";
    return (
      <div
        className={`flex items-center justify-center gap-2 shrink-0 ${dense ? "py-0.5" : "py-2"}`}
      >
        <span
          className={[
            "font-semibold transition-colors duration-300",
            dense ? "text-xs" : "text-sm",
            isHuman ? "text-cyan-400" : "text-amber-400",
          ].join(" ")}
        >
          {name}
        </span>
        <span className="text-gray-500">·</span>
        <span className={`text-gray-400 ${dense ? "text-xs" : "text-sm"}`}>{phaseStr}</span>
      </div>
    );
  }

  const opponentLabel = isMultiplayer ? "Opponent" : "AI";
  const message = isHuman
    ? turnPhase === "play"
      ? "Select a card to play or discard"
      : "Draw a card from the pile or discard"
    : isMultiplayer
      ? "Waiting for opponent\u2026"
      : "AI is thinking\u2026";

  return (
    <div className="flex items-center gap-2">
      <span
        className={["text-xs font-semibold", isHuman ? "text-cyan-400" : "text-amber-400"].join(
          " ",
        )}
      >
        {isHuman ? "Your turn" : `${opponentLabel} turn`}
      </span>
      <span className="text-gray-500">&middot;</span>
      <span className="text-xs text-gray-400">{message}</span>
      {!isHuman && (
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
      )}
    </div>
  );
}
