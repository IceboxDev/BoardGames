import type { DurakPlayerView } from "@boardgames/core/games/durak/types";
import {
  type GameOverAction,
  GameOverLayout,
  GameOverStats,
  StatItem,
} from "../../../components/game-over";

interface GameOverScreenProps {
  view: DurakPlayerView;
  playerIndex: number;
  /** Who sat at each seat, for naming the durak. */
  seatNames: readonly string[];
  actions: readonly GameOverAction[];
}

export default function GameOverScreen({
  view,
  playerIndex,
  seatNames,
  actions,
}: GameOverScreenProps) {
  const isDraw = view.durak === null;
  const isLoser = view.durak === playerIndex;
  const durakName = view.durak === null ? null : (seatNames[view.durak] ?? "Another player");

  return (
    <GameOverLayout
      emoji={isDraw ? undefined : isLoser ? "🃏" : "🏆"}
      headline={isDraw ? "Draw!" : isLoser ? "You are the Durak!" : "You Win!"}
      headlineColor={isDraw ? "draw" : isLoser ? "lose" : "win"}
      subtitle={
        isDraw
          ? "Everyone shed their cards together. No Durak today."
          : isLoser
            ? "You were the last player holding cards. Better luck next time!"
            : `${durakName} is the Durak. You shed all your cards in time!`
      }
      actions={actions}
    >
      <GameOverStats>
        <StatItem label="Rounds played" value={view.turnCount} />
        <StatItem label="Cards in deck" value={view.drawPileCount} />
      </GameOverStats>
    </GameOverLayout>
  );
}
