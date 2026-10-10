import type { HistoryEntry } from "@boardgames/core/games/chess/schemas";
import { useEffect, useRef } from "react";
import { Button } from "../../../components/ui";
import { cn } from "../../../lib/cn";

export type MoveGrade = "best" | "inaccuracy" | "mistake" | "blunder" | null;

const GRADE_MARK: Readonly<
  Record<Exclude<MoveGrade, null>, { mark: string; className: string; label: string }>
> = {
  best: { mark: "★", className: "text-emerald-400", label: "best move" },
  inaccuracy: { mark: "?!", className: "text-amber-300", label: "inaccuracy" },
  mistake: { mark: "?", className: "text-orange-400", label: "mistake" },
  blunder: { mark: "??", className: "text-rose-400", label: "blunder" },
};

interface Props {
  history: readonly HistoryEntry[];
  /** The ply shown on the board (0 = start), or `null` when following the game live. */
  viewing: number | null;
  onSelect: (ply: number | null) => void;
  /** The first move's number and side (a game from a FEN may start with Black). */
  startNumber?: number;
  startsWithBlack?: boolean;
  grades?: readonly MoveGrade[];
}

/**
 * The game's moves as the usual two-column score sheet. Chess notation is
 * tabular, so this replaces the shared `ActionLog` in the History rail: one
 * row per move number, a click shows that position.
 */
export function MoveList({
  history,
  viewing,
  onSelect,
  startNumber = 1,
  startsWithBlack = false,
  grades,
}: Props) {
  const endRef = useRef<HTMLDivElement | null>(null);
  const live = viewing === null;

  const plies = history.length;
  // Follow the newest move while live (re-run when a move arrives).
  useEffect(() => {
    if (live && plies >= 0) endRef.current?.scrollIntoView({ block: "nearest" });
  }, [live, plies]);

  const offset = startsWithBlack ? 1 : 0;
  const rows: { number: number; plies: (number | null)[] }[] = [];
  for (let i = -offset; i < history.length; i += 2) {
    rows.push({
      number: startNumber + (i + offset) / 2,
      plies: [i >= 0 ? i : null, i + 1 < history.length ? i + 1 : null],
    });
  }
  const current = viewing ?? history.length;
  const cellProps = { history, current, grades, onSelect };

  return (
    <div className="flex min-h-0 flex-col gap-2">
      {history.length === 0 ? (
        <p className="text-sm text-fg-muted">No moves yet.</p>
      ) : (
        <ol className="grid grid-cols-[2.25rem_1fr_1fr] gap-x-1 gap-y-0.5 text-sm">
          {rows.map((row) => (
            <li key={row.number} className="contents">
              <span className="py-0.5 text-right tabular-nums text-fg-muted">{row.number}.</span>
              <MoveCell ply={row.plies[0] ?? null} {...cellProps} />
              <MoveCell ply={row.plies[1] ?? null} {...cellProps} />
            </li>
          ))}
        </ol>
      )}
      <div ref={endRef} />
      {!live && (
        <Button size="xs" variant="secondary" onClick={() => onSelect(null)}>
          Back to the game →
        </Button>
      )}
    </div>
  );
}

function MoveCell({
  ply,
  history,
  current,
  grades,
  onSelect,
}: {
  ply: number | null;
  history: readonly HistoryEntry[];
  current: number;
  grades?: readonly MoveGrade[];
  onSelect: (ply: number | null) => void;
}) {
  if (ply === null) return <span />;
  const entry = history[ply];
  const grade = grades?.[ply] ?? null;
  const mark = grade ? GRADE_MARK[grade] : null;
  const selected = current === ply + 1;
  return (
    <Button
      variant="plain"
      size="xs"
      align="start"
      onClick={() => onSelect(ply + 1 === history.length ? null : ply + 1)}
      aria-current={selected ? "step" : undefined}
      aria-label={`${entry?.san ?? ""}${mark ? `, ${mark.label}` : ""}`}
      className={cn(
        "rounded-ui-md px-1.5 py-0.5 text-sm font-medium text-fg-primary hover:bg-fill",
        selected && "bg-fill-strong text-fg-strong",
      )}
    >
      {entry?.san}
      {mark && <span className={cn("ml-0.5 font-bold", mark.className)}>{mark.mark}</span>}
    </Button>
  );
}
