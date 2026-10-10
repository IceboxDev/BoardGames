import type { GameRecord, Seat } from "@boardgames/core/games/connect-4/types";
import { useState } from "react";
import type { GameOverAction } from "../../../../components/game-over";
import { Button } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import { AnalysisBoard } from "./AnalysisBoard";
import { SeriesPicker } from "./SeriesPicker";

export type ResultTone = "win" | "lose" | "draw" | "neutral";

const TITLE_INK: Record<ResultTone, string> = {
  win: "text-emerald-300",
  lose: "text-rose-300",
  draw: "text-fg-primary",
  neutral: "text-fg-strong",
};

/** A hairline under the header that glows in the result's colour. */
const GLOW: Record<ResultTone, string> = {
  win: "via-emerald-400/60",
  lose: "via-rose-400/60",
  draw: "via-fg-muted/40",
  neutral: "via-accent-400/50",
};

interface Props {
  /** The result for the viewer ("You lose"), or who played (a replay). */
  title: string;
  tone: ResultTone;
  /** One quiet line beside it: how it ended, the board, the series. */
  detail: string;
  /** Play again and friends (none in a replay). */
  actions?: readonly GameOverAction[];
  /** The series' games; the last is shown first. */
  games: readonly GameRecord[];
  cols: number;
  rows: number;
  popOut: boolean;
  names: readonly string[];
  /** Seats whose mistakes can be practised: the viewer's (both, in a replay). */
  practiceSeats: readonly Seat[];
}

/**
 * A finished game, end to end on one screen: the result in a single line on
 * top, the analysis board filling the rest. Nothing scrolls but the lists
 * that have to.
 */
export function AnalysisScreen({
  title,
  tone,
  detail,
  actions = [],
  games,
  cols,
  rows,
  popOut,
  names,
  practiceSeats,
}: Props) {
  const [picked, setPicked] = useState<number | null>(null);
  const gameIndex = picked ?? games.length - 1;
  const game = games[gameIndex];
  if (!game) return null;
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <header className="relative flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 lg:px-10">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className={cn("shrink-0 text-xl font-semibold tracking-tight", TITLE_INK[tone])}>
            {title}
          </h1>
          <p className="min-w-0 truncate text-sm text-fg-muted">{detail}</p>
        </div>
        {games.length > 1 && <SeriesPicker games={games} value={gameIndex} onChange={setPicked} />}
        {actions.length > 0 && (
          <div className="ml-auto flex flex-wrap gap-2">
            {actions.map((action) => (
              <Button
                key={action.label}
                size="sm"
                variant={action.variant === "primary" ? "primary" : "ghost"}
                onClick={action.onClick}
              >
                {action.label}
              </Button>
            ))}
          </div>
        )}
        <span
          aria-hidden
          className={cn(
            "absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent to-transparent",
            GLOW[tone],
          )}
        />
      </header>
      <AnalysisBoard
        key={gameIndex}
        game={game}
        cols={cols}
        rows={rows}
        popOut={popOut}
        names={names}
        practiceSeats={practiceSeats}
      />
    </div>
  );
}
