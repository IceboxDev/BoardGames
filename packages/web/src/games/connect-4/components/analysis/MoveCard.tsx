import type { MoveRecord } from "@boardgames/core/games/connect-4/types";
import type { ReactNode } from "react";
import { Button, Spinner } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import type { MoveStory, Outcome } from "../../logic/analysis-model";
import {
  bestText,
  outcomeText,
  practiceAnswer,
  practiceDone,
  practiceFeedback,
  practicePrompt,
  seatName,
  storyText,
} from "../../logic/text";
import type { Practice } from "../../logic/useAnalysisBoard";
import { seatInk } from "../board/palette";
import { DiscGlyph, EvalChip } from "./EvalChip";
import { GRADES, ONLY_MOVE } from "./grades";

/** The insight slot under the board: a kicker line, the outcome on the right, then prose. */
function Frame({
  kicker,
  aside,
  children,
}: {
  kicker: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-label="Analysis of the position shown"
      aria-live="polite"
      className="flex min-h-24 min-w-0 flex-col gap-1.5"
    >
      <header className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">{kicker}</div>
        {aside}
      </header>
      {children}
    </section>
  );
}

function Kicker({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("shrink-0 text-xs font-semibold uppercase tracking-label", className)}>
      {children}
    </span>
  );
}

const Prose = ({ children }: { children: ReactNode }) => (
  <p className="text-sm leading-relaxed text-fg-secondary">{children}</p>
);

/** Where a move went, quietly: "Move 25 · ○ You → column 3". */
function MoveLine({
  move,
  index,
  names,
}: {
  move: MoveRecord;
  index: number;
  names: readonly string[];
}) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-xs text-fg-muted">
      <span className="font-mono tabular-nums">Move {index + 1}</span>
      <span aria-hidden>·</span>
      <span className="flex min-w-0 items-center gap-1" style={{ color: seatInk(move.player) }}>
        <DiscGlyph seat={move.player} />
        <span className="truncate">{seatName(move.player, names)}</span>
      </span>
      <span className="shrink-0">
        → {move.type === "drop" ? "column" : "pops"} {move.column + 1}
      </span>
    </span>
  );
}

/** Before → after, in the analysis's type. */
function Transition({
  before,
  after,
  names,
}: {
  before: Outcome;
  after: Outcome;
  names: readonly string[];
}) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <EvalChip outcome={before} names={names} size="md" />
      <span aria-hidden className="text-fg-disabled">
        →
      </span>
      <EvalChip outcome={after} names={names} size="md" />
    </span>
  );
}

/** The start: what best play from the empty board gets. */
export function StartCard({ outcome, names }: { outcome: Outcome; names: readonly string[] }) {
  return (
    <Frame
      kicker={<Kicker className="text-fg-muted">Start position</Kicker>}
      aside={<EvalChip outcome={outcome} names={names} size="md" />}
    >
      <Prose>
        {outcome.kind === "unknown" ? "Not solved yet." : `${outcomeText(outcome, names)}.`}{" "}
        <span className="text-fg-muted">Step with ← →, or drop a disc to explore.</span>
      </Prose>
    </Frame>
  );
}

interface MoveCardProps {
  move: MoveRecord;
  index: number;
  /** Null while the move waits to be graded. */
  story: MoveStory | null;
  names: readonly string[];
  /** Why a move the solver couldn't judge has no grade. */
  unsolvedNote: string;
}

/** What the selected move did: its grade, the outcome before → after, the best move. */
export function MoveCard({ move, index, story, names, unsolvedNote }: MoveCardProps) {
  const line = <MoveLine move={move} index={index} names={names} />;
  if (!story) {
    return (
      <Frame kicker={line}>
        <p className="flex items-center gap-2 text-sm text-fg-muted">
          <Spinner size="sm" /> Grading this move…
        </p>
      </Frame>
    );
  }
  if (story.change === "unknown") {
    return (
      <Frame kicker={line}>
        <Prose>{unsolvedNote}</Prose>
      </Frame>
    );
  }
  const look = story.onlyMove ? ONLY_MOVE : GRADES[story.grade];
  return (
    <Frame
      kicker={
        <>
          <span aria-hidden className={cn("font-mono text-lg font-bold leading-none", look.ink)}>
            {look.mark || "✓"}
          </span>
          <Kicker className={look.ink}>{look.word}</Kicker>
          {line}
        </>
      }
      aside={<Transition before={story.before} after={story.after} names={names} />}
    >
      <Prose>
        {storyText(story, names)}{" "}
        <span className="font-medium text-fg-primary">{bestText(story)}</span>
      </Prose>
    </Frame>
  );
}

interface SideLineCardProps {
  /** The game move the line branches after (0: the start). */
  from: number;
  line: readonly MoveRecord[];
  /** The side line's position now. */
  outcome: Outcome;
  end: "four" | "full" | null;
  names: readonly string[];
  onUndo: () => void;
  onBack: () => void;
}

/** A what-if line played from the game: its moves and where it stands. */
export function SideLineCard({
  from,
  line,
  outcome,
  end,
  names,
  onUndo,
  onBack,
}: SideLineCardProps) {
  const last = line.at(-1);
  return (
    <Frame
      kicker={
        <>
          <Kicker className="text-accent-300">Side line</Kicker>
          <span className="truncate text-xs text-fg-muted">
            {from === 0 ? "from the start" : `from move ${from}`}
          </span>
        </>
      }
      aside={<EvalChip outcome={outcome} names={names} size="md" />}
    >
      <ol
        className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs"
        aria-label="Side line moves"
      >
        {line.map((m) => (
          <li
            key={`${m.column}-${m.row}`}
            className="flex items-center gap-1"
            style={{ color: seatInk(m.player) }}
          >
            <DiscGlyph seat={m.player} />
            {m.column + 1}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Prose>
          {end === "four" && last
            ? `${seatName(last.player, names)} connects four.`
            : end === "full"
              ? "The board is full — a draw."
              : `${outcomeText(outcome, names)}.`}
        </Prose>
        <span className="flex gap-1">
          <Button size="xs" variant="ghost" onClick={onUndo}>
            Undo
          </Button>
          <Button size="xs" variant="ghost" onClick={onBack}>
            Back to game
          </Button>
        </span>
      </div>
    </Frame>
  );
}

interface PracticeCardProps {
  practice: Practice;
  /** The slip being retried (null once all are done). */
  story: MoveStory | null;
  /** The latest answer: its column and where it leads. */
  answer: { column: number; outcome: Outcome } | null;
  /** The fastest columns, once the position is solved. */
  best: readonly number[];
  /** Still solving the position's columns: answers wait. */
  solving: boolean;
  names: readonly string[];
  onNext: () => void;
  onStop: () => void;
}

/** "Learn from your mistakes": find what was missed, one position at a time. */
export function PracticeCard({
  practice,
  story,
  answer,
  best,
  solving,
  names,
  onNext,
  onStop,
}: PracticeCardProps) {
  const total = practice.queue.length;
  const done = practice.at >= total || !story;
  const kicker = (
    <>
      <Kicker className="text-accent-300">Practice</Kicker>
      <span className="font-mono text-xs tabular-nums text-fg-muted">
        {done ? `${total}/${total}` : `${practice.at + 1}/${total}`}
      </span>
    </>
  );
  if (done) {
    return (
      <Frame
        kicker={kicker}
        aside={
          <Button size="xs" onClick={onStop}>
            Back to the game
          </Button>
        }
      >
        <Prose>{practiceDone(practice.found, total)}</Prose>
      </Frame>
    );
  }
  const feedback = answer
    ? practiceFeedback(practice.solved ?? "misses", answer.column, answer.outcome, best, names)
    : "";
  return (
    <Frame
      kicker={kicker}
      aside={
        <span className="flex gap-1">
          <Button size="xs" variant="ghost" onClick={onStop}>
            Stop
          </Button>
          <Button size="xs" variant={practice.solved ? "primary" : "secondary"} onClick={onNext}>
            {practice.at + 1 < total ? (practice.solved ? "Next" : "Skip") : "Finish"}
          </Button>
        </span>
      }
    >
      <Prose>{practicePrompt(story, names)}</Prose>
      {solving && !answer && (
        <p className="flex items-center gap-2 text-xs text-fg-muted">
          <Spinner size="sm" /> Solving the position…
        </p>
      )}
      {feedback && (
        <p
          className={cn(
            "text-sm font-medium",
            practice.solved ? "text-emerald-300" : "text-rose-300",
          )}
        >
          {feedback}
        </p>
      )}
      {practice.revealed && !practice.solved && (
        <Prose>{practiceAnswer(story.best.length > 0 ? story.best : best)}</Prose>
      )}
    </Frame>
  );
}
