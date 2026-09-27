import type { GameState } from "@boardgames/core/games/exploding-kittens/types";
import { type GameOverAction, GameOverLayout } from "../../../components/game-over";
import { Surface } from "../../../components/ui/Surface";

interface GameOverScreenProps {
  state: GameState;
  /** This player's seat — the headline is from their point of view. */
  myIndex: number;
  /** Who sat at each seat ("You", room names, AI labels). */
  seatNames: readonly string[];
  actions: readonly GameOverAction[];
}

export default function GameOverScreen({
  state,
  myIndex,
  seatNames,
  actions,
}: GameOverScreenProps) {
  const iWon = state.winner === myIndex;
  const nameOf = (seat: number) =>
    seat === myIndex ? "You" : (seatNames[seat] ?? `Player ${seat + 1}`);

  const eliminatedPlayers = (state.actionLog ?? [])
    .filter((e) => e.action === "exploded")
    .map((e) => e.playerIndex);

  return (
    <GameOverLayout
      emoji={iWon ? "🎉" : "💀"}
      headline={
        iWon ? "You Win!" : `${state.winner === null ? "Nobody" : nameOf(state.winner)} Wins!`
      }
      headlineColor={iWon ? "win" : "lose"}
      subtitle={`Game lasted ${state.turnCount} turns`}
      actions={actions}
    >
      <Surface variant="panel" padding="lg" className="text-left">
        <p className="mb-2 text-sm font-medium text-fg-secondary">Elimination Order</p>
        <div className="space-y-1">
          {eliminatedPlayers.map((seat, i) => (
            <div key={seat} className="flex items-center gap-2 text-sm text-fg-secondary">
              <span className="text-fg-disabled">{i + 1}.</span>
              <span>💀</span>
              <span>{nameOf(seat)}</span>
            </div>
          ))}
          {state.winner !== null && (
            <div className="flex items-center gap-2 text-sm text-emerald-400">
              <span className="text-fg-disabled">🏆</span>
              <span>👑</span>
              <span>{nameOf(state.winner)}</span>
              <span className="text-xs text-fg-muted">(survivor)</span>
            </div>
          )}
        </div>
      </Surface>
    </GameOverLayout>
  );
}
