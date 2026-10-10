import type { GoReview } from "@boardgames/core/protocol";
import { Button, ProgressBar, Surface } from "../../../../components/ui";
import AnalysisGraph from "./AnalysisGraph";

interface Props {
  readonly review: GoReview | undefined;
  readonly loading: boolean;
  /** Moves played in the position on the board. */
  readonly at: number;
  readonly movers: readonly (0 | 1)[];
  readonly onSelect: (moves: number) => void;
}

function pct(w: number): string {
  return `${Math.round(w * 100)}%`;
}

function lead(scoreLead: number): string {
  if (Math.abs(scoreLead) < 0.05) return "even";
  return `${scoreLead > 0 ? "B" : "W"}+${Math.abs(scoreLead).toFixed(1)}`;
}

/** KataGo's review beside a replayed game: progress, the graph, this move, key mistakes. */
export default function ReviewPanel({ review, loading, at, movers, onSelect }: Props) {
  if (loading || !review || review.status === "unavailable") return null;
  if (review.status === "failed") {
    return (
      <Surface variant="raised" padding="sm" className="text-sm text-fg-secondary">
        The review couldn't be finished{review.error ? `: ${review.error}` : "."}
      </Surface>
    );
  }
  if (review.status !== "done" || !review.analysis) {
    return (
      <Surface variant="raised" padding="sm" className="flex flex-col gap-2">
        <span className="text-sm text-fg-secondary">
          {review.status === "queued" ? "Waiting for KataGo…" : "KataGo is reviewing the game…"}
        </span>
        <ProgressBar value={review.progress} label="Review progress" />
      </Surface>
    );
  }
  const a = review.analysis;
  const here = at === 0 ? a.start : a.moves[at - 1];
  const next = a.moves[at];
  const worst = [...a.moves]
    .sort((x, y) => y.loss - x.loss)
    .filter((m) => m.loss >= 1)
    .slice(0, 5);
  return (
    <Surface variant="raised" padding="sm" className="flex flex-col gap-3">
      <AnalysisGraph analysis={a} at={at} onSelect={onSelect} movers={movers} />
      {here && (
        <div className="text-sm text-fg-secondary">
          Black {pct(here.winrate)} · {lead(here.scoreLead)}
          {next?.best && (
            <>
              {" · "}KataGo would play{" "}
              <span className="font-semibold text-fg-strong">{next.best}</span>
              {next.loss >= 0.5 && ` (the game move lost ${next.loss.toFixed(1)})`}
            </>
          )}
        </div>
      )}
      {worst.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-fg-muted">Key mistakes</span>
          {worst.map((m) => (
            <Button key={m.move} size="xs" variant="secondary" onClick={() => onSelect(m.move - 1)}>
              {m.move}. −{m.loss.toFixed(1)}
            </Button>
          ))}
        </div>
      )}
      <span className="text-xs text-fg-muted">KataGo, {a.visits} visits per position</span>
    </Surface>
  );
}
