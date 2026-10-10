import { type Clue, formatClueCount } from "@boardgames/core/games/codenames/clue-rules";
import type { ReactNode } from "react";
import { EyeIcon, EyeOffIcon } from "../../../components/icons";
import { IconButton } from "../../../components/ui";
import { cn } from "../../../lib/cn";
import type { CoverTone } from "./WordGrid";

// The strip above the board, shared by Codenames and Duet: whose turn and
// what they're doing (left), the clue in play — or the composer, or who is
// thinking (centre), and the turn's controls (right). It has ONE fixed
// height in every phase, so the board below never moves.

export function TableHeader({
  status,
  center,
  controls,
}: {
  status: ReactNode;
  center: ReactNode;
  controls?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid h-28 shrink-0 grid-cols-[minmax(0,1fr)_auto] grid-rows-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 rounded-card-xl border border-line-soft bg-surface-900/70 px-3 py-2 shadow-lg",
        "sm:h-20 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:grid-rows-1 sm:px-4",
      )}
    >
      <div className="col-span-2 row-start-1 flex min-w-0 items-center justify-center sm:col-span-1 sm:col-start-2">
        {center}
      </div>
      <div className="row-start-2 flex min-w-0 items-center sm:col-start-1 sm:row-start-1">
        {status}
      </div>
      <div className="row-start-2 flex items-center justify-end gap-2 sm:col-start-3 sm:row-start-1">
        {controls}
      </div>
    </div>
  );
}

const DOT: Record<CoverTone, string> = {
  red: "bg-cn-red",
  blue: "bg-cn-blue",
  tan: "bg-cn-tan",
  ink: "bg-cn-ink",
  green: "bg-cn-green",
};

const INK: Record<CoverTone, string> = {
  red: "text-cn-red",
  blue: "text-cn-blue",
  tan: "text-cn-tan",
  ink: "text-fg-strong",
  green: "text-cn-green",
};

/** "RED · Your clue": the side to play, and what is happening. */
export function TurnStatus({
  tone,
  side,
  doing,
  mine,
  waiting,
}: {
  tone: CoverTone;
  side: string;
  doing: string;
  /** The viewer has to act now. */
  mine: boolean;
  waiting: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="relative flex h-3 w-3 shrink-0">
        {waiting && (
          <span
            className={cn("absolute inset-0 animate-ping rounded-full opacity-60", DOT[tone])}
          />
        )}
        <span className={cn("relative h-3 w-3 rounded-full", DOT[tone])} />
      </span>
      <div className="flex min-w-0 flex-col leading-tight">
        <span className={cn("text-xs font-black uppercase tracking-pill", INK[tone])}>{side}</span>
        <span
          className={cn(
            "truncate text-xs",
            mine ? "font-semibold text-fg-strong" : "text-fg-secondary",
          )}
        >
          {doing}
        </span>
      </div>
    </div>
  );
}

/** The clue in play, printed like a card's name plate, with the guesses left as pips. */
export function ClueDisplay({
  clue,
  tone,
  guessesMade,
  guessesLeft,
}: {
  clue: Clue;
  tone: CoverTone;
  guessesMade: number;
  /** null = unlimited; undefined = don't show (Duet). */
  guessesLeft?: number | null;
}) {
  const total =
    guessesLeft === null || guessesLeft === undefined ? null : guessesMade + guessesLeft;
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-stretch overflow-hidden rounded-ui-lg shadow-lg ring-1 ring-cn-card-ink/20">
        <span className="flex items-center bg-cn-plate px-4 py-1.5 text-xl font-black uppercase tracking-pill text-cn-card-ink sm:text-2xl">
          {clue.word}
        </span>
        <span
          className={cn(
            "flex min-w-11 items-center justify-center px-2 text-xl font-black tabular-nums text-cn-cover-ink sm:text-2xl",
            DOT[tone],
          )}
        >
          {formatClueCount(clue.count)}
        </span>
      </div>
      {guessesLeft !== undefined && (
        <div className="flex flex-col items-start gap-1">
          {total === null ? (
            <span className="text-3xs font-semibold uppercase tracking-label text-fg-muted">
              Unlimited
            </span>
          ) : (
            <span className="flex gap-1" title={`${guessesLeft} of ${total} guesses left`}>
              {Array.from({ length: total }, (_, i) => (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: pips are positional
                  key={i}
                  className={cn(
                    "h-2 w-2 rounded-full",
                    i < guessesMade ? "bg-fill-strong" : DOT[tone],
                  )}
                />
              ))}
            </span>
          )}
          <span className="text-3xs text-fg-muted tabular-nums">
            {total === null
              ? `${guessesMade} touched`
              : `${guessesLeft} guess${guessesLeft === 1 ? "" : "es"} left`}
          </span>
        </div>
      )}
    </div>
  );
}

/** Someone else is thinking: their name and three breathing dots. */
export function ThinkingLine({ who, what }: { who: string; what: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-fg-secondary">
      <span className="flex gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-fg-muted"
            style={{ animationDelay: `${i * 140}ms` }}
          />
        ))}
      </span>
      <span>
        <span className="font-semibold text-fg-primary">{who}</span> {what}
      </span>
    </div>
  );
}

/** The spymaster's key on/off — to see the board the way the team does. */
export function KeyToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <IconButton
      variant="bordered"
      size="sm"
      icon={shown ? <EyeIcon /> : <EyeOffIcon />}
      aria-label={shown ? "Hide the key" : "Show the key"}
      title={shown ? "Hide the key — see the board as your team does" : "Show the key"}
      pressed={!shown}
      onClick={onToggle}
    />
  );
}

/** Some AI move this game came from the stand-in (no model reachable). */
export function StandInBadge() {
  return (
    <span
      title="The AI model couldn't be reached for some moves, so a simple stand-in played them. Clues like THING 1 are the stand-in's."
      className="hidden shrink-0 rounded-full bg-amber-500/15 px-2.5 py-1 text-3xs font-semibold uppercase tracking-label text-amber-300 ring-1 ring-amber-400/30 md:inline"
    >
      AI offline · stand-in
    </span>
  );
}
