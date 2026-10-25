import type { PgnInput } from "@boardgames/core/games/chess/pgn";
import type { ReactNode } from "react";
import type { GameOverAction } from "../../../../components/game-over";
import { Button, Surface } from "../../../../components/ui";
import { useMediaQuery, WIDE_BOARD_QUERY } from "../../../../hooks/useMediaQuery";
import { PgnButtons } from "../PgnButtons";

/**
 * The review's action bar, the live bar's twin (same surface and height):
 * flip and step, what to do next (Play again, Rematch…), practice and PGN.
 * Buttons only — the result and the move's story live in the strips and rail.
 */
export function ReviewActions({
  onFlip,
  onStep,
  endActions,
  practice,
  pgn,
  extra,
}: {
  onFlip: () => void;
  onStep: (by: 1 | -1) => void;
  endActions: readonly GameOverAction[];
  /** "Learn from your mistakes": its count, or `null` while there's nothing to offer. */
  practice: { count: number; ready: boolean; onStart: () => void } | null;
  pgn: PgnInput;
  extra?: ReactNode;
}) {
  const wide = useMediaQuery(WIDE_BOARD_QUERY);
  return (
    <Surface
      variant="raised"
      padding="sm"
      className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-2 whitespace-nowrap lg:flex-nowrap"
    >
      <div className="flex items-center gap-2">
        <Button size="xs" variant="ghost" onClick={onFlip} title="Turn the board around (F)">
          ⇅ Flip
        </Button>
        {!wide && (
          <>
            <Button size="xs" variant="ghost" onClick={() => onStep(-1)} aria-label="Previous move">
              ‹
            </Button>
            <Button size="xs" variant="ghost" onClick={() => onStep(1)} aria-label="Next move">
              ›
            </Button>
          </>
        )}
      </div>

      <div className="flex flex-1 flex-wrap items-center justify-center gap-2 lg:flex-nowrap">
        {endActions.map((a) => (
          <Button
            key={a.label}
            size="xs"
            variant={a.variant === "primary" ? "primary" : "secondary"}
            onClick={a.onClick}
          >
            {a.label}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 lg:flex-nowrap">
        {practice && (
          <Button
            size="xs"
            variant="tinted"
            tone="amber"
            onClick={practice.onStart}
            disabled={!practice.ready}
            title={
              practice.ready
                ? "Play each of your mistakes again and find a better move"
                : "Waiting for the analysis"
            }
          >
            Practise mistakes{practice.ready ? ` (${practice.count})` : ""}
          </Button>
        )}
        {extra}
        <PgnButtons input={pgn} compact />
      </div>
    </Surface>
  );
}
