import type { ReactNode } from "react";
import { Button } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import { formatScore, type Score } from "../../analysis/grade";
import { GRADE_MARK } from "../../analysis/grade-marks";
import type { MoveStory } from "../../analysis/review-model";

/**
 * The review's one-move card: what the move on screen did, a what-if line,
 * or the practice prompt. A fixed height in every state, so nothing around
 * it moves as you step through the game.
 */
function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-20 shrink-0 flex-col justify-center gap-0.5 overflow-hidden rounded-card-md bg-fill px-3 py-2 ring-1 ring-line-soft">
      {children}
    </div>
  );
}

function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex min-w-0 items-center gap-2", className)}>{children}</div>;
}

const Eval = ({ score }: { score: Score | null | undefined }) => (
  <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-fg-secondary">
    {score ? formatScore(score) : "…"}
  </span>
);

const WORD_TONE: Record<string, string> = {
  best: "text-emerald-300",
  inaccuracy: "text-amber-200",
  mistake: "text-orange-300",
  blunder: "text-rose-300",
};

/** The move that made the position on screen. */
export function StoryCard({
  label,
  story,
  bestLine,
  pending,
}: {
  /** "22. Qxb7" */
  label: string;
  story: MoveStory | null;
  /** The engine's line where the move was played, as text; shown for a flawed move. */
  bestLine: string | null;
  pending: boolean;
}) {
  const mark = story?.grade ? GRADE_MARK[story.grade] : null;
  const flawed = story?.grade && story.grade !== "best";
  return (
    <Frame>
      <Row className="justify-between">
        <span className="truncate text-sm font-bold text-fg-strong">
          {label}
          {mark && <span className={cn("ml-0.5", mark.className)}>{mark.mark}</span>}
        </span>
        {story ? (
          <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-fg-secondary">
            {formatScore(story.before)} → {formatScore(story.after)}
          </span>
        ) : (
          <Eval score={null} />
        )}
      </Row>
      <p
        className={cn(
          "truncate text-sm font-medium",
          story?.grade ? WORD_TONE[story.grade] : "text-fg-secondary",
        )}
      >
        {story ? story.words : pending ? "Analysing…" : "Not analysed"}
      </p>
      <p className="truncate text-xs text-fg-muted">
        {flawed && bestLine ? `Best was ${bestLine}` : " "}
      </p>
    </Frame>
  );
}

/** The start position, before any move. */
export function StartCard({ score }: { score: Score | null | undefined }) {
  return (
    <Frame>
      <Row className="justify-between">
        <span className="text-sm font-bold text-fg-strong">Starting position</span>
        <Eval score={score} />
      </Row>
      <p className="truncate text-xs text-fg-muted">
        Step through with ← →, or play a move to try a line.
      </p>
    </Frame>
  );
}

/** A what-if line played from a game position. */
export function SideLineCard({
  text,
  score,
  onBack,
}: {
  text: string;
  score: Score | null | undefined;
  onBack: () => void;
}) {
  return (
    <Frame>
      <Row className="justify-between">
        <span className="text-2xs font-semibold uppercase tracking-label text-accent-300">
          What if
        </span>
        <Button size="xs" variant="ghost" onClick={onBack} title="Back to the game (Esc)">
          Back to game
        </Button>
      </Row>
      <Row className="justify-between">
        <span className="truncate text-sm font-semibold text-fg-strong">{text}</span>
        <Eval score={score} />
      </Row>
    </Frame>
  );
}

export type PracticeView =
  | { kind: "ask"; against: string }
  | { kind: "judging"; against: string }
  | { kind: "miss"; drop: number; against: string }
  | { kind: "revealed"; answer: string }
  | { kind: "solved"; verdict: "best" | "keeps"; line: string }
  | { kind: "done"; found: number; total: number };

/** "Learn from your mistakes": the prompt, the verdict, the way on. */
export function PracticeCard({
  view,
  at,
  total,
  onNext,
  onStop,
}: {
  view: PracticeView;
  /** 1-based. */
  at: number;
  total: number;
  onNext: () => void;
  onStop: () => void;
}) {
  const done = view.kind === "done";
  return (
    <Frame>
      <Row className="justify-between">
        <span className="text-2xs font-semibold uppercase tracking-label text-accent-300">
          {done ? "Practice done" : `Learn from your mistakes · ${at} of ${total}`}
        </span>
        {done ? (
          <Button size="xs" variant="secondary" onClick={onStop}>
            Back to the game
          </Button>
        ) : view.kind === "solved" ? (
          <Button size="xs" variant="primary" onClick={onNext} title="Next (Enter)">
            {at === total ? "Finish" : "Next ›"}
          </Button>
        ) : (
          <Button size="xs" variant="ghost" onClick={onStop} title="Stop (Esc)">
            Stop
          </Button>
        )}
      </Row>
      {view.kind === "ask" && (
        <p className="truncate text-sm font-medium text-fg-strong">
          Find a better move than {view.against}
        </p>
      )}
      {view.kind === "judging" && (
        <p className="truncate text-sm font-medium text-fg-secondary">Checking…</p>
      )}
      {view.kind === "miss" && (
        <>
          <p className="truncate text-sm font-medium text-rose-300">Not it</p>
          <p className="truncate text-xs text-fg-muted">
            That still gives away {Math.round(view.drop)}% · better than {view.against}?
          </p>
        </>
      )}
      {view.kind === "revealed" && (
        <>
          <p className="truncate text-sm font-medium text-amber-200">The arrow shows the move</p>
          <p className="truncate text-xs text-fg-muted">The move was {view.answer} — play it</p>
        </>
      )}
      {view.kind === "solved" && (
        <>
          <p className="truncate text-sm font-medium text-emerald-300">
            {view.verdict === "best" ? "Best!" : "Good enough: keeps the edge"}
          </p>
          <p className="truncate text-xs text-fg-muted">{view.line}</p>
        </>
      )}
      {view.kind === "done" && (
        <p className="truncate text-sm font-medium text-fg-strong">
          Found {view.found} of {view.total} on your own
        </p>
      )}
    </Frame>
  );
}
