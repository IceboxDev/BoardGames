import { Connect4ReplayLogSchema } from "@boardgames/core/games/connect-4/replay-log";
import { AI_STRATEGY_LABELS } from "@boardgames/core/games/connect-4/types";
import { useMemo } from "react";
import useDocumentTitle from "../../../hooks/useDocumentTitle";
import type { ReplayProps } from "../../types";
import { replayGames } from "../logic/replay";
import { colourName } from "../logic/text";
import { AnalysisScreen } from "./analysis/AnalysisScreen";

const BOTH_SEATS = [0, 1] as const;

/** A finished match from history, on the same analysis screen as the game's end. */
export default function GameReplay({ game }: ReplayProps) {
  const parsed = useMemo(() => Connect4ReplayLogSchema.safeParse(game), [game]);
  const log = parsed.success ? parsed.data : null;
  // The log records which seats were bots; people show as their colour.
  const names = useMemo(
    () =>
      log?.strategies.map((s, i) => (s ? AI_STRATEGY_LABELS[s] : colourName(i === 0 ? 0 : 1))) ??
      [],
    [log],
  );
  const series = useMemo(() => (log ? replayGames(log) : null), [log]);
  useDocumentTitle(log ? `Replay · ${log.wins.join("–")} · Connect 4` : "Replay · Connect 4");

  if (!series) {
    return <p className="p-4 text-sm text-fg-muted">This replay cannot be shown.</p>;
  }
  const board = `${series.cols}×${series.rows}${series.popOut ? " PopOut" : ""}`;
  return (
    <AnalysisScreen
      title={`${names[0]} vs ${names[1]}`}
      tone="neutral"
      detail={
        series.games.length > 1 ? `${board} · series ${series.wins[0]}–${series.wins[1]}` : board
      }
      games={series.games}
      cols={series.cols}
      rows={series.rows}
      popOut={series.popOut}
      names={names}
      practiceSeats={BOTH_SEATS}
    />
  );
}
