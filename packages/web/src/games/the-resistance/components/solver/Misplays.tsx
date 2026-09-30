import type { SeatNamer } from "@boardgames/core/games/the-resistance/solver/deductions";
import type { Grade, GradedDecision } from "@boardgames/core/games/the-resistance/solver/grade";
import { useState } from "react";
import { Badge, SegmentedControl } from "../../../../components/ui";
import { ExplainRow } from "./explain/ExplainRow";
import { GRADE_STYLE } from "./grade-style";

const SERIOUS: readonly Grade[] = ["inaccuracy", "mistake", "blunder"];

type Filter = "misplays" | "all";

interface MisplaysProps {
  decisions: readonly GradedDecision[];
  name: SeatNamer;
  /** Open the explanation of a decision. */
  onExplain: (decision: GradedDecision) => void;
  /** The decision the timeline is on, if any. */
  current?: number;
  /** Every role is known — without that there is nothing to grade. */
  rolesKnown: boolean;
}

const PLURAL: Record<Grade, string> = {
  best: "best",
  good: "good",
  note: "notes",
  inaccuracy: "inaccuracies",
  mistake: "mistakes",
  blunder: "blunders",
};

/** The graded decision feed: misplays by default, everything on demand. */
export function Misplays({ decisions, name, onExplain, current, rolesKnown }: MisplaysProps) {
  const [filter, setFilter] = useState<Filter>("misplays");
  const shown = filter === "all" ? decisions : decisions.filter((d) => SERIOUS.includes(d.grade));
  const counts = SERIOUS.map((g) => [g, decisions.filter((d) => d.grade === g).length] as const);

  if (!rolesKnown) {
    return (
      <p className="text-xs text-fg-muted">
        Misplays are judged once every role is known — the same move can be a Resistance error and a
        spy's best play. They appear when the game ends and roles are revealed, or from the start if
        you assign the roles to a tabletop game.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {counts.map(([g, count]) => (
            <Badge key={g} size="xs" tone={count > 0 ? GRADE_STYLE[g].tone : "neutral"}>
              {count} {count === 1 ? GRADE_STYLE[g].label.toLowerCase() : PLURAL[g]}
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
              <ExplainRow
                onClick={() => onExplain(d)}
                label={`Explain: ${name(d.seat)} · ${d.title}`}
                active={current === d.eventIndex}
                className="flex flex-col gap-0.5 py-1.5"
              >
                <span className="flex items-start gap-2">
                  <Badge size="xs" tone={GRADE_STYLE[d.grade].tone}>
                    {GRADE_STYLE[d.grade].label}
                  </Badge>
                  <span className="min-w-0 flex-1 text-xs font-semibold text-fg-primary">
                    {name(d.seat)}{" "}
                    <span className={d.role === "spy" ? "text-rose-300" : "text-sky-300"}>
                      ({d.role === "spy" ? "spy" : "Res"})
                    </span>{" "}
                    · {d.title}
                  </span>
                  <span className="shrink-0 text-2xs text-fg-muted">R{d.round + 1}</span>
                </span>
                <span className="text-2xs text-fg-secondary">{d.detail}</span>
              </ExplainRow>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
