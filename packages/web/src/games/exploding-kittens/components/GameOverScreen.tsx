import type { AIStrategyId, GameState } from "@boardgames/core/games/exploding-kittens/types";
import { AI_STRATEGY_LABELS } from "@boardgames/core/games/exploding-kittens/types";
import { GameOverLayout } from "../../../components/game-over";

interface GameOverScreenProps {
  state: GameState;
  onPlayAgain: () => void;
  onChangeSetup: () => void;
  onViewReplay?: () => void;
}

export default function GameOverScreen({
  state,
  onPlayAgain,
  onChangeSetup,
  onViewReplay,
}: GameOverScreenProps) {
  const winner = state.winner !== null ? state.players[state.winner] : null;
  const isHumanWin = winner?.type === "human";

  const eliminatedPlayers = (state.actionLog ?? [])
    .filter((e) => e.action === "exploded")
    .map((e) => e.playerIndex);

  return (
    <GameOverLayout
      emoji={isHumanWin ? "🎉" : "💀"}
      headline={isHumanWin ? "You Win!" : `AI ${state.winner} Wins!`}
      headlineColor={isHumanWin ? "win" : "lose"}
      subtitle={`Game lasted ${state.turnCount} turns${
        winner && !isHumanWin && winner.aiStrategy
          ? ` · Strategy: ${AI_STRATEGY_LABELS[winner.aiStrategy as AIStrategyId]}`
          : ""
      }`}
      actions={[
        { label: "Play Again", variant: "primary", onClick: onPlayAgain },
        ...(onViewReplay
          ? [{ label: "View Replay", variant: "secondary" as const, onClick: onViewReplay }]
          : []),
        { label: "Change Setup", variant: "secondary", onClick: onChangeSetup },
      ]}
    >
      <div className="rounded-xl border border-white/10 bg-surface-800 p-4 text-left">
        <p className="mb-2 text-sm font-medium text-fg-secondary">Elimination Order</p>
        <div className="space-y-1">
          {eliminatedPlayers.map((pi, i) => {
            const p = state.players[pi];
            return (
              <div key={pi} className="flex items-center gap-2 text-sm text-fg-secondary">
                <span className="text-fg-disabled">{i + 1}.</span>
                <span>💀</span>
                <span>{p.type === "human" ? "You" : `AI ${pi}`}</span>
                {p.aiStrategy && (
                  <span className="text-xs text-fg-disabled">
                    ({AI_STRATEGY_LABELS[p.aiStrategy]})
                  </span>
                )}
              </div>
            );
          })}
          {winner && (
            <div className="flex items-center gap-2 text-sm text-emerald-400">
              <span className="text-fg-disabled">🏆</span>
              <span>👑</span>
              <span>{winner.type === "human" ? "You" : `AI ${winner.index}`}</span>
              <span className="text-xs text-fg-muted">(survivor)</span>
            </div>
          )}
        </div>
      </div>
    </GameOverLayout>
  );
}
