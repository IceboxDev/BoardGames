import type { SeatNamer } from "@boardgames/core/games/the-resistance/solver/deductions";
import type { Grade, GradedDecision } from "@boardgames/core/games/the-resistance/solver/grade";
import { useState } from "react";
import { Badge, SegmentedControl, type Tone } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";

const GRADE_STYLE: Record<Grade, { label: string; tone: Tone }> = {
  best: { label: "Best", tone: "emerald" },
  good: { label: "Good", tone: "sky" },
  note: { label: "Note", tone: "neutral" },
  inaccuracy: { label: "Inaccuracy", tone: "amber" },
  mistake: { label: "Mistake", tone: "orange" },
  blunder: { label: "Blunder", tone: "rose" },
};

const SERIOUS: readonly Grade[] = ["inaccuracy", "mistake", "blunder"];

type Filter = "misplays" | "all";

interface MisplaysProps {
  decisions: readonly GradedDecision[];
  name: SeatNamer;
  /** Jump the timeline to a decision. */
  onSelect?: (eventIndex: number) => void;
  /** The decision the timeline is on, if any. */
  current?: number;
}

/** The graded decision feed: misplays by default, everything on demand. */
export function Misplays({ decisions, name, onSelect, current }: MisplaysProps) {
  const [filter, setFilter] = useState<Filter>("misplays");
  const shown = filter === "all" ? decisions : decisions.filter((d) => SERIOUS.includes(d.grade));
  const counts = SERIOUS.map((g) => [g, decisions.filter((d) => d.grade === g).length] as const);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {counts.map(([g, count]) => (
            <Badge key={g} size="xs" tone={count > 0 ? GRADE_STYLE[g].tone : "neutral"}>
              {count} {GRADE_STYLE[g].label.toLowerCase()}
              {count === 1 ? "" : "s"}
            </Badge>
          ))}
        </div>
        <SegmentedControl<Filter>
          size="xs"
          shape="pill"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "misplays", label: "Misplays" },
            { value: "all", label: "All" },
          ]}
        />
      </div>
      {shown.length === 0 ? (
        <p className="text-xs text-fg-muted">
          {decisions.length === 0 ? "No decisions to judge yet." : "No misplays so far."}
        </p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {shown.map((d) => (
            <li key={`${d.eventIndex}-${d.seat}-${d.kind}`}>
              {/* biome-ignore lint/correctness/noRestrictedElements: a two-line feed row that scrubs the timeline — no Button variant lays out a title + detail */}
              <button
                type="button"
                onClick={() => onSelect?.(d.eventIndex)}
                className={cn(
                  "flex w-full flex-col gap-0.5 rounded-ui-md px-2 py-1.5 text-left transition-colors hover:bg-fill",
                  current === d.eventIndex && "bg-fill",
                )}
              >
                <span className="flex items-center gap-2">
                  <Badge size="xs" tone={GRADE_STYLE[d.grade].tone}>
                    {GRADE_STYLE[d.grade].label}
                  </Badge>
                  <span className="truncate text-xs font-semibold text-fg-primary">
                    {name(d.seat)} · {d.title}
                  </span>
                  <span className="ml-auto shrink-0 text-2xs text-fg-muted">R{d.round + 1}</span>
                </span>
                <span className="text-2xs text-fg-secondary">
                  {d.detail}
                  {d.hypothetical && <span className="text-fg-muted"> (if Resistance)</span>}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
