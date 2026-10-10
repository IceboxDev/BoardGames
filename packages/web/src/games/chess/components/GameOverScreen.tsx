import type { ChessPlayerView } from "@boardgames/core/games/chess/schemas";
import type { GameOutcome } from "@boardgames/core/machines/outcome";
import {
  type GameOverAction,
  GameOverLayout,
  outcomeHeadline,
} from "../../../components/game-over";
import { resultText } from "../logic/result-text";
import ChessBoard from "./board/ChessBoard";
import { PgnButtons } from "./PgnButtons";

interface Props {
  view: ChessPlayerView;
  outcome: GameOutcome | null;
  seat: number;
  names: { w: string; b: string };
  actions: readonly GameOverAction[];
}

export default function GameOverScreen({ view, outcome, seat, names, actions }: Props) {
  const { headline, color } = outcomeHeadline(outcome, seat);
  const plies = view.history.length;
  return (
    <GameOverLayout
      headline={headline}
      headlineColor={color}
      subtitle={`${view.result ? resultText(view.result) : "Game over"} · ${Math.ceil(plies / 2)} moves`}
      actions={actions}
    >
      <div className="flex flex-col items-center gap-4">
        <div className="aspect-square w-full max-w-sm">
          <ChessBoard
            className="size-full overflow-hidden rounded-card-md shadow-lg"
            fen={view.fen}
            orientation={view.color ?? "w"}
            moves={[]}
            lastMove={view.history.at(-1)?.uci ?? null}
            aria-label="Final position"
          />
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <PgnButtons
            input={{
              startFen: view.startFen,
              moves: view.history,
              result: view.result,
              timeControl: view.timeControl,
              white: names.w,
              black: names.b,
              date: new Date(),
            }}
          />
        </div>
      </div>
    </GameOverLayout>
  );
}
