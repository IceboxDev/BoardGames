import type { BughousePlayerView } from "@boardgames/core/games/chess-bughouse/schemas";
import type { GameOutcome } from "@boardgames/core/machines/outcome";
import {
  type GameOverAction,
  GameOverLayout,
  outcomeHeadline,
} from "../../../components/game-over";
import ChessBoard from "../../chess/components/board/ChessBoard";
import { bughouseResultText } from "../result-text";

const BOARD = ["Board A", "Board B"] as const;

interface Props {
  view: BughousePlayerView;
  outcome: GameOutcome | null;
  names: readonly string[];
  actions: readonly GameOverAction[];
}

export default function GameOverScreen({ view, outcome, names, actions }: Props) {
  const { headline, color } = outcomeHeadline(outcome, view.seat);
  return (
    <GameOverLayout
      headline={headline}
      headlineColor={color}
      subtitle={view.result ? bughouseResultText(view.result, names) : "Game over"}
      actions={actions}
      wide
    >
      <div className="flex flex-wrap justify-center gap-6">
        {view.boards.map((b, i) => (
          <figure key={BOARD[i]} className="flex w-full max-w-xs flex-col items-center gap-2">
            <div className="aspect-square w-full">
              <ChessBoard
                bughouse
                className="size-full overflow-hidden rounded-card-md shadow-lg"
                fen={b.fen}
                orientation={i === view.board ? view.color : view.color === "w" ? "b" : "w"}
                moves={[]}
                lastMove={b.history.at(-1)?.uci ?? null}
                aria-label={`${BOARD[i]} final position`}
              />
            </div>
            <figcaption className="text-sm text-fg-secondary">
              {BOARD[i]} · {b.history.length} moves
            </figcaption>
          </figure>
        ))}
      </div>
    </GameOverLayout>
  );
}
