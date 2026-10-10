import type { MoveGrade } from "@boardgames/core/games/connect-4/solver/analysis";
import type { MoveRecord } from "@boardgames/core/games/connect-4/types";
import { useEffect, useRef } from "react";
import { cn } from "../../../../lib/cn";
import type { PlyPoint } from "../../logic/analysis-model";
import { DISC_COLORS, seatInk } from "../board/palette";
import { DiscGlyph, EvalChip } from "./EvalChip";
import { GRADES } from "./grades";

interface Props {
  moves: readonly MoveRecord[];
  points: readonly PlyPoint[];
  grades: Readonly<Record<number, MoveGrade>>;
  names: readonly string[];
  /** The position shown: after `ply` moves (-1: none of the game's, e.g. in a side line). */
  ply: number;
  onSelect: (ply: number) => void;
}

const CELL =
  "flex min-w-0 items-center gap-1.5 rounded-ui-md px-1.5 py-1 text-left transition-colors";

function MoveCell({
  move,
  index,
  point,
  grade,
  names,
  selected,
  onSelect,
}: {
  move: MoveRecord;
  index: number;
  point: PlyPoint | undefined;
  grade: MoveGrade | undefined;
  names: readonly string[];
  selected: boolean;
  onSelect: () => void;
}) {
  const look = grade ? GRADES[grade.grade] : null;
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  const label = `Move ${index + 1}: ${DISC_COLORS[move.player].name} ${
    move.type === "drop" ? "column" : "pops column"
  } ${move.column + 1}${look ? ` — ${look.word}` : ""}`;
  return (
    // biome-ignore lint/correctness/noRestrictedElements: a dense, selectable move-list cell.
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      aria-label={label}
      aria-current={selected ? "step" : undefined}
      className={cn(CELL, selected ? "bg-fill-strong text-fg-strong" : "hover:bg-fill")}
    >
      <span style={{ color: seatInk(move.player) }}>
        <DiscGlyph seat={move.player} />
      </span>
      <span className="w-5 shrink-0 font-mono tabular-nums">
        {move.type === "pop" ? "↓" : ""}
        {move.column + 1}
      </span>
      <span aria-hidden className={cn("w-4 shrink-0 font-mono font-bold", look?.ink)}>
        {look?.mark}
      </span>
      <span className="ml-auto">
        {point && point.outcome.kind !== "unknown" && (
          <EvalChip outcome={point.outcome} names={names} />
        )}
      </span>
    </button>
  );
}

/** The game's moves in rounds: each with its slip mark and the outcome it left. */
export function MoveList({ moves, points, grades, names, ply, onSelect }: Props) {
  const rows: { round: number; first: number; second: number | null }[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    rows.push({ round: i / 2 + 1, first: i, second: i + 1 < moves.length ? i + 1 : null });
  }
  const cell = (i: number) => (
    <MoveCell
      move={moves[i]}
      index={i}
      point={points[i + 1]}
      grade={grades[i]}
      names={names}
      selected={ply === i + 1}
      onSelect={() => onSelect(i + 1)}
    />
  );
  return (
    <ol
      aria-label="Moves"
      className="grid min-w-0 grid-cols-[1.75rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-1 text-xs text-fg-secondary"
    >
      <li className="contents">
        <span />
        {/* biome-ignore lint/correctness/noRestrictedElements: the move list's start row. */}
        <button
          type="button"
          onClick={() => onSelect(0)}
          aria-current={ply === 0 ? "step" : undefined}
          className={cn(
            CELL,
            "col-span-2 justify-between",
            ply === 0 ? "bg-fill-strong text-fg-strong" : "text-fg-muted hover:bg-fill",
          )}
        >
          <span>Start</span>
          {points[0] && points[0].outcome.kind !== "unknown" && (
            <EvalChip outcome={points[0].outcome} names={names} />
          )}
        </button>
      </li>
      {rows.map(({ round, first, second }) => (
        <li key={round} className="contents">
          <span className="pr-1 text-right font-mono tabular-nums text-fg-disabled">{round}</span>
          {cell(first)}
          {second !== null ? cell(second) : <span />}
        </li>
      ))}
    </ol>
  );
}
