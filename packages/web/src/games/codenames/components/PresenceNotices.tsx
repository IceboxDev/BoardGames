import { useEffect, useState } from "react";
import { BotIcon } from "../../../components/icons";
import { Button } from "../../../components/ui";
import { cn } from "../../../lib/cn";
import type { AwayNotice } from "../logic/table";

// Who dropped out of the room, floating at the foot of the board (an overlay:
// the board never moves for it). For each person gone: how long ago, why it
// matters ("the table is waiting on their clue"), and — once they've had a
// fair chance to come back — a button that lets the AI play their seat until
// they return. A returning player whose stand-in is mid-move is told the seat
// is theirs again the moment that move is done.

/** "0:07", "1:42". */
function clock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** The current time, ticking once a second while `on`. */
function useNow(on: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [on]);
  return now;
}

const WAITING_ON: Record<"clue" | "guess" | "ruling", string> = {
  clue: "The table is waiting on their clue",
  guess: "The table is waiting on their guesses",
  ruling: "A clue is waiting on their ruling",
};

export function PresenceNotices({
  notices,
  nameOf,
  waitingFor,
  returning,
  onHandOver,
}: {
  notices: readonly AwayNotice[];
  nameOf: (seat: number) => string;
  /** What a blocking seat is holding up (from the phase). */
  waitingFor: "clue" | "guess" | "ruling";
  /** The viewer is back and their AI stand-in is finishing a move. */
  returning: boolean;
  onHandOver: (seat: number) => void;
}) {
  const now = useNow(notices.length > 0);
  if (notices.length === 0 && !returning) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-2 z-raised flex flex-col items-center gap-1.5 px-2">
      {returning && (
        <div className="pointer-events-auto flex max-w-full items-center gap-2 rounded-full bg-surface-900/95 px-3 py-1.5 text-xs text-fg-secondary shadow-xl ring-1 ring-line-strong backdrop-blur">
          <BotIcon className="h-3.5 w-3.5 shrink-0 text-sky-300" />
          <span className="min-w-0 truncate">
            Welcome back — the AI is finishing a move for you; your seat is yours right after.
          </span>
        </div>
      )}
      {notices.map((n) => {
        const name = nameOf(n.seat);
        const ready = now >= n.handoverAt;
        return (
          <div
            key={n.seat}
            className={cn(
              "pointer-events-auto flex max-w-full items-center gap-3 rounded-full bg-surface-900/95 py-1.5 pr-1.5 pl-3 shadow-xl ring-1 backdrop-blur",
              n.blocking ? "ring-amber-400/50" : "ring-line-strong",
            )}
            role="status"
          >
            <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
              <span className="absolute inset-0 animate-ping rounded-full bg-amber-400 opacity-60" />
              <span className="relative h-2.5 w-2.5 rounded-full bg-amber-400" />
            </span>
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-xs text-fg-primary">
                <span className="font-semibold">{name}</span> dropped out
                <span className="tabular-nums text-fg-muted"> · {clock(now - n.since)}</span>
              </span>
              <span
                className={cn("truncate text-3xs", n.blocking ? "text-amber-300" : "text-fg-muted")}
              >
                {n.blocking
                  ? WAITING_ON[waitingFor]
                  : ready
                    ? "The AI can keep their seat warm"
                    : `The AI can step in in ${clock(n.handoverAt - now)}`}
              </span>
            </span>
            <Button
              size="sm"
              variant={n.blocking ? "primary" : "secondary"}
              shape="pill"
              disabled={!ready}
              onClick={() => onHandOver(n.seat)}
              title={
                ready
                  ? `The AI plays for ${name} until they're back — they take the seat back the moment they return`
                  : `Give ${name} ${clock(n.handoverAt - now)} more to come back`
              }
              className="shrink-0"
            >
              {ready ? (
                <>
                  <span className="sm:hidden">Let the AI play</span>
                  <span className="hidden sm:inline">Let the AI play for {name}</span>
                </>
              ) : (
                clock(n.handoverAt - now)
              )}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
