import type { Connect4PlayerView, Seat } from "@boardgames/core/games/connect-4/types";
import type { ReactNode } from "react";
import { Badge, MicroLabel } from "../../../components/ui";
import { cn } from "../../../lib/cn";
import { colourName, seatName } from "../logic/text";
import { DISC_COLORS } from "./board/palette";

interface Props {
  view: Connect4PlayerView;
  /** The viewer's seat, or null (replay / spectator). */
  seat: number | null;
  names: readonly string[];
  aiThinking: boolean;
  /** Below the players (the evaluation bar). */
  children?: ReactNode;
}

function DiscIcon({ seat }: { seat: Seat }) {
  const c = DISC_COLORS[seat];
  return (
    <span
      aria-hidden
      className="inline-block size-5 shrink-0 rounded-full border-2"
      style={{ background: c.fill, borderColor: c.rim }}
    />
  );
}

const SEATS = [0, 1] as const satisfies readonly Seat[];

/** The left rail: both players, whose move it is, the series score. */
export function PlayersPanel({ view, seat, names, aiThinking, children }: Props) {
  const series = view.config.bestOf > 1;
  const target = Math.floor(view.config.bestOf / 2) + 1;
  return (
    <div className="flex flex-col gap-4">
      {series && (
        <div className="flex flex-col gap-0.5">
          <MicroLabel>
            Game {view.gameIndex + 1} of up to {view.config.bestOf}
          </MicroLabel>
          <span className="text-xs text-fg-muted">First to {target} wins the series</span>
        </div>
      )}
      <ul className="flex flex-col gap-2">
        {SEATS.map((s) => {
          const toMove = view.phase === "playing" && view.currentPlayer === s;
          return (
            <li
              key={s}
              className={cn(
                "flex items-center gap-2 rounded-ui-md border px-2.5 py-2 transition-colors",
                toMove ? "border-line-strong bg-fill-strong" : "border-line-soft bg-fill-soft",
              )}
            >
              <DiscIcon seat={s} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold text-fg-primary">
                  {seatName(s, names)}
                </span>
                <span className="text-2xs text-fg-muted">
                  {colourName(s)}
                  {view.firstPlayer === s ? " · opens" : ""}
                </span>
              </div>
              {seat === s && (
                <Badge tone="accent" size="xs">
                  You
                </Badge>
              )}
              {toMove && aiThinking && view.strategies[s] && (
                <span className="size-2 animate-pulse rounded-full bg-amber-400" title="Thinking" />
              )}
              {series && (
                <span className="text-lg font-bold tabular-nums text-fg-strong">
                  {view.wins[s]}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {children}
    </div>
  );
}
