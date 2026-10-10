import { cn } from "../../../../lib/cn";
import { FLAWS, practiceMoves, type PlayerSummary as Summary } from "../../logic/analysis-model";
import { flawCount, seatName } from "../../logic/text";
import { DISC_COLORS, seatInk } from "../board/palette";
import { DiscGlyph } from "./EvalChip";
import { GRADES } from "./grades";

interface Props {
  summary: Summary;
  names: readonly string[];
  /** The position shown: a slip counter steps to the next such move after it. */
  ply: number;
  onSelect: (ply: number) => void;
  /** Offered for the viewer (both, in a replay); omitted: no practice. */
  onPractice?: (moves: number[]) => void;
  /** Still grading: the numbers aren't in yet. */
  grading: boolean;
}

/** The next move in `moves` after the shown one, wrapping around. */
function nextAfter(moves: readonly number[], ply: number): number {
  return moves.find((i) => i + 1 > ply) ?? moves[0];
}

/** One player's game: the share of moves that kept the best outcome, and each kind of slip. */
export function PlayerSummary({ summary, names, ply, onSelect, onPractice, grading }: Props) {
  const practice = practiceMoves(summary);
  const accuracy = !grading && summary.graded > 0 ? summary.perfect / summary.graded : null;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <p
        className="flex min-w-0 items-center gap-1.5 text-xs font-medium"
        style={{ color: seatInk(summary.seat) }}
      >
        <DiscGlyph seat={summary.seat} />
        <span className="truncate">{seatName(summary.seat, names)}</span>
      </p>
      <p className="flex items-baseline gap-0.5">
        <span
          className={cn(
            "font-mono text-3xl font-light tabular-nums tracking-tight",
            accuracy === null ? "animate-pulse text-fg-disabled" : "text-fg-strong",
          )}
        >
          {accuracy === null ? "··" : Math.round(accuracy * 100)}
        </span>
        <span className="text-xs text-fg-muted">%</span>
      </p>
      <div className="h-0.5 w-full overflow-hidden rounded-full bg-fill">
        <div
          className="h-full rounded-full transition-[width] duration-700"
          style={{
            width: `${(accuracy ?? 0) * 100}%`,
            background: DISC_COLORS[summary.seat].fill,
          }}
        />
      </div>
      <p className="text-2xs text-fg-muted">
        {grading
          ? "Grading…"
          : `${summary.perfect} of ${summary.graded} moves perfect${
              summary.graded < summary.moves ? ` · ${summary.moves - summary.graded} unsolved` : ""
            }`}
      </p>
      <div className="flex gap-3 font-mono text-xs">
        {FLAWS.map((flaw) => {
          const moves = summary.flaws[flaw];
          const look = GRADES[flaw];
          const label = flawCount(flaw, moves.length);
          return moves.length > 0 ? (
            // biome-ignore lint/correctness/noRestrictedElements: a compact counter that steps through those moves.
            <button
              key={flaw}
              type="button"
              onClick={() => onSelect(nextAfter(moves, ply) + 1)}
              title={`${label} — show the next`}
              aria-label={`${label}: show the next`}
              className={cn("rounded-ui-md tabular-nums hover:underline", look.ink)}
            >
              {look.mark} {moves.length}
            </button>
          ) : (
            <span key={flaw} title={label} className="tabular-nums text-fg-disabled">
              {look.mark} 0
            </span>
          );
        })}
      </div>
      {onPractice && practice.length > 0 && (
        // biome-ignore lint/correctness/noRestrictedElements: an inline text action under the stats.
        <button
          type="button"
          onClick={() => onPractice(practice)}
          className="mt-0.5 self-start text-xs font-medium text-accent-300 hover:text-accent-200"
        >
          Practise {practice.length === 1 ? "this mistake" : `${practice.length} mistakes`} →
        </button>
      )}
    </div>
  );
}
