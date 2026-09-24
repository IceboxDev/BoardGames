import { daysBetween, type SrsGrade } from "@boardgames/core/games/quiztopia/srs";
import { Button, Kbd } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import type { SessionReview } from "../../hooks/useTrainerSession";

// The one row of controls under the card, pinned to the bottom on phones:
// "Reveal" before the flip, "Didn't know" / "Knew it" after, an undo link,
// and a live region that says when the last card comes back — so the
// schedule is never a mystery.

type Props = {
  revealed: boolean;
  /** The card's chunk is still loading — nothing to reveal yet. */
  disabled?: boolean;
  onReveal: () => void;
  onGrade: (grade: SrsGrade) => void;
  canUndo: boolean;
  onUndo: () => void;
  lastReview: SessionReview | null;
  today: string;
  className?: string;
};

function nextDueSentence(review: SessionReview, today: string): string {
  if (review.grade === "again") return "Didn't know — it comes back in a few cards.";
  const days = daysBetween(today, review.next.dueDate);
  if (days <= 0) return "Knew it — again today.";
  if (days === 1) return "Knew it — next tomorrow.";
  return `Knew it — next in ${days} days.`;
}

export function GradeBar({
  revealed,
  disabled = false,
  onReveal,
  onGrade,
  canUndo,
  onUndo,
  lastReview,
  today,
  className,
}: Props) {
  return (
    <div
      className={cn(
        "sticky bottom-0 z-lift border-t border-line bg-surface-950/90 px-4 pb-4 pt-3 backdrop-blur",
        className,
      )}
    >
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-2">
        {revealed ? (
          <div className="grid w-full grid-cols-2 gap-3">
            <Button
              variant="tinted"
              tone="rose"
              size="lg"
              block
              onClick={() => onGrade("again")}
              disabled={disabled}
            >
              Didn't know
              <Kbd className="hidden sm:inline-flex">1</Kbd>
            </Button>
            <Button
              variant="solid"
              tone="emerald"
              size="lg"
              block
              onClick={() => onGrade("good")}
              disabled={disabled}
            >
              Knew it
              <Kbd className="hidden sm:inline-flex">2</Kbd>
            </Button>
          </div>
        ) : (
          <Button variant="primary" size="lg" block onClick={onReveal} disabled={disabled}>
            Reveal
            <Kbd className="hidden sm:inline-flex">Space</Kbd>
          </Button>
        )}
        <div className="flex min-h-4 w-full items-center justify-between gap-3 text-2xs">
          <p aria-live="polite" className="min-w-0 truncate text-fg-muted">
            {lastReview ? nextDueSentence(lastReview, today) : ""}
          </p>
          {canUndo && lastReview && (
            <Button variant="link" size="xs" onClick={onUndo} className="shrink-0">
              Undo — {lastReview.grade === "good" ? "knew it" : "didn't know"}
              <Kbd className="hidden sm:inline-flex">U</Kbd>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
