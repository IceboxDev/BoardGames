import type { Connect4PlayerView, Seat } from "@boardgames/core/games/connect-4/types";
import type { GameOutcome } from "@boardgames/core/machines/outcome";
import { type GameOverAction, outcomeHeadline } from "../../../components/game-over";
import { endWords } from "../logic/text";
import { AnalysisScreen } from "./analysis/AnalysisScreen";

interface Props {
  view: Connect4PlayerView;
  outcome: GameOutcome | null;
  seat: number;
  names: readonly string[];
  actions: readonly GameOverAction[];
}

/** The result in one line, then the finished game on the analysis board. */
export default function GameOverScreen({ view, outcome, seat, names, actions }: Props) {
  const { headline, color } = outcomeHeadline(outcome, seat);
  const last = view.games.at(-1);
  if (!last) return null;
  const board = `${view.cols}×${view.rows}${view.config.popOut ? " PopOut" : ""}`;
  const series = view.games.length > 1 ? ` · series ${view.wins[0]}–${view.wins[1]}` : "";
  const practiceSeats: Seat[] = seat === 0 || seat === 1 ? [seat] : [];
  return (
    <AnalysisScreen
      title={headline}
      tone={color}
      detail={`${endWords(last, names).brief} · ${board}${series}`}
      actions={actions}
      games={view.games}
      cols={view.cols}
      rows={view.rows}
      popOut={view.config.popOut}
      names={names}
      practiceSeats={practiceSeats}
    />
  );
}
