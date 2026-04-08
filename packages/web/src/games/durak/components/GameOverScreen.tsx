import type { DurakPlayerView } from "@boardgames/core/games/durak/types";
import { GameOverLayout, GameOverStats, StatItem } from "../../../components/game-over";

interface GameOverScreenProps {
  view: DurakPlayerView;
  playerIndex: number;
  onPlayAgain: () => void;
  onChangeSetup: () => void;
}

export default function GameOverScreen({
  view,
  playerIndex,
  onPlayAgain,
  onChangeSetup,
}: GameOverScreenProps) {
  const isDraw = view.durak === null;
  const isLoser = view.durak === playerIndex;

  return (
    <GameOverLayout
      emoji={isDraw ? undefined : isLoser ? "🃏" : "🏆"}
      headline={isDraw ? "Draw!" : isLoser ? "You are the Durak!" : "You Win!"}
      headlineColor={isDraw ? "draw" : isLoser ? "lose" : "win"}
      subtitle={
        isDraw
          ? "Both players shed all their cards. No Durak today."
          : isLoser
            ? "You were the last player holding cards. Better luck next time!"
            : "The AI is the Durak. You successfully shed all your cards!"
      }
      actions={[
        { label: "Play Again", variant: "primary", onClick: onPlayAgain },
        { label: "Change Setup", variant: "secondary", onClick: onChangeSetup },
      ]}
    >
      <GameOverStats>
        <StatItem label="Rounds played" value={view.turnCount} />
        <StatItem label="Cards in deck" value={view.drawPileCount} />
      </GameOverStats>
    </GameOverLayout>
  );
}
