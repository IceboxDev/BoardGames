import type { Seat } from "@boardgames/core/games/connect-4/types";
import { cn } from "../../../../lib/cn";
import type { Outcome } from "../../logic/analysis-model";
import { chipText, chipTitle } from "../../logic/text";
import { seatInk } from "../board/palette";

/** A seat's disc mark in miniature: a ring for Red, a dot for Yellow (as on the discs). */
export function DiscGlyph({ seat, className }: { seat: Seat; className?: string }) {
  return (
    <svg viewBox="0 0 10 10" aria-hidden="true" className={cn("size-2 shrink-0", className)}>
      {seat === 0 ? (
        <circle cx="5" cy="5" r="3.6" fill="none" stroke="currentColor" strokeWidth="2.2" />
      ) : (
        <circle cx="5" cy="5" r="4" fill="currentColor" />
      )}
    </svg>
  );
}

interface Props {
  outcome: Outcome;
  names: readonly string[];
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZES = { sm: "text-2xs", md: "text-sm", lg: "text-lg" } as const;

/**
 * An outcome in the analysis's type: `#7` in the winner's ink (they win with
 * their 7th disc from here), `=` a draw, `?` not solved. The winner's disc
 * mark rides along, so it never relies on colour alone.
 */
export function EvalChip({ outcome, names, size = "sm", className }: Props) {
  const winner = outcome.kind === "win" || outcome.kind === "over" ? outcome.winner : null;
  const title = chipTitle(outcome, names);
  return (
    <span
      title={title}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 font-mono font-medium tabular-nums leading-none",
        SIZES[size],
        winner === null && (outcome.kind === "unknown" ? "text-fg-disabled" : "text-fg-secondary"),
        className,
      )}
      style={winner === null ? undefined : { color: seatInk(winner) }}
    >
      {winner !== null && (
        <DiscGlyph seat={winner} className={size === "lg" ? "size-2.5" : undefined} />
      )}
      <span aria-hidden>{chipText(outcome)}</span>
      <span className="sr-only">{title}</span>
    </span>
  );
}
