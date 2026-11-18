import { type Clue, formatClueCount } from "@boardgames/core/games/codenames/clue-rules";
import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { EyeIcon, EyeOffIcon } from "../../../components/icons";
import { Badge, IconButton, PipMeter, ThinkingDots } from "../../../components/ui";
import { TONE_TEXT } from "../../../components/ui/tones";
import { cn } from "../../../lib/cn";
import type { CoverTone } from "./WordGrid";

// The strip above the board, shared by Codenames and Duet (the table kit, `index.ts`): whose turn and
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
        "grid h-table-header shrink-0 grid-cols-[minmax(0,1fr)_auto] grid-rows-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 rounded-card-xl border border-line-soft bg-surface-900/70 px-3 py-2 shadow-lg",
        "sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:grid-rows-1 sm:px-4",
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

/**
 * "RED · Your clue": WHO is to play (a team, a person, "Sudden death") over
 * WHAT is happening now. Every game fills the two lines the same way.
 */
export function TurnStatus({
  tone,
  who,
  activity,
  mine,
}: {
  tone: CoverTone;
  /** The side or seat to play, as the uppercase kicker. */
  who: string;
  /** What is happening ("Your guess", "Spymaster is thinking"). */
  activity: string;
  /** The viewer has to act now (a steady dot); otherwise the dot pings while they wait. */
  mine: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="relative flex h-3 w-3 shrink-0">
        {!mine && (
          <span
            className={cn(
              "absolute inset-0 animate-ping rounded-full opacity-60 motion-reduce:hidden",
              DOT[tone],
            )}
          />
        )}
        <span className={cn("relative h-3 w-3 rounded-full", DOT[tone])} />
      </span>
      <div className="flex min-w-0 flex-col leading-tight">
        <span className={cn("text-xs font-black uppercase tracking-pill", INK[tone])}>{who}</span>
        <span
          className={cn(
            "truncate text-xs",
            mine ? "font-semibold text-fg-strong" : "text-fg-secondary",
          )}
        >
          {activity}
        </span>
      </div>
    </div>
  );
}

/** How many guesses the clue in play leaves: a number, unlimited, or not shown (Duet). */
export type ClueGuesses = { left: number } | "unlimited" | "hidden";

/** The clue in play, printed like a card's name plate, with the guesses left as pips. */
export function ClueDisplay({
  clue,
  tone,
  guessesMade,
  guesses,
}: {
  clue: Clue;
  tone: CoverTone;
  guessesMade: number;
  guesses: ClueGuesses;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  return (
    <div className="flex items-center gap-3">
      {/* Each new clue settles in once; the guesses ticking down never replay it. */}
      <motion.div
        key={`${clue.word}:${String(clue.count)}`}
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
        className="flex items-stretch overflow-hidden rounded-ui-lg shadow-lg ring-1 ring-cn-card-ink/20"
      >
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
      </motion.div>
      {guesses !== "hidden" && (
        <div className="flex flex-col items-start gap-1">
          {guesses === "unlimited" ? (
            <span className="text-3xs font-semibold uppercase tracking-label text-fg-muted">
              Unlimited
            </span>
          ) : (
            <PipMeter
              variant="dots"
              total={guessesMade + guesses.left}
              filled={guessesMade}
              fillClass="bg-fill-strong"
              restClass={DOT[tone]}
              title={`${guesses.left} of ${guessesMade + guesses.left} guesses left`}
            />
          )}
          <span className="text-3xs text-fg-muted tabular-nums">
            {guesses === "unlimited"
              ? `${guessesMade} touched`
              : `${guesses.left} guess${guesses.left === 1 ? "" : "es"} left`}
          </span>
        </div>
      )}
    </div>
  );
}

/** A phase with no clue to show (Duet's sudden death): one warning line in the clue's place. */
export function PhaseBanner({ children }: { children: ReactNode }) {
  return (
    <span className={cn("text-sm font-semibold uppercase tracking-pill", TONE_TEXT.amber)}>
      {children}
    </span>
  );
}

/** Someone else is thinking: their name and three breathing dots. */
export function ThinkingLine({ who, what }: { who: string; what: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-fg-secondary">
      <ThinkingDots size="sm" tone="muted" />
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
    <Badge
      tone="amber"
      shape="pill"
      ring
      title="The AI model couldn't be reached for some moves, so a simple stand-in played them. Clues like THING 1 are the stand-in's."
      className="hidden md:inline-flex"
    >
      AI offline · stand-in
    </Badge>
  );
}
