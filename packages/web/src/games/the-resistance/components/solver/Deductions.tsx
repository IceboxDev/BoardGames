import type { Deduction } from "@boardgames/core/games/the-resistance/solver/deductions";
import { Badge } from "../../../../components/ui";
import { ExplainRow } from "./explain/ExplainRow";

const KIND_TONE = {
  "spies-exact": "rose",
  spy: "rose",
  resistance: "sky",
  "at-least": "amber",
  clean: "sky",
  contradiction: "amber",
} as const;

/** Proven facts first, then what the assumptions add. */
export function Deductions({
  items,
  limit,
  onExplain,
}: {
  items: readonly Deduction[];
  limit?: number;
  /** Open the proof of a fact. */
  onExplain?: (fact: Deduction) => void;
}) {
  const sorted = [...items].sort(
    (a, b) => Number(a.certainty !== "proven") - Number(b.certainty !== "proven"),
  );
  const shown = limit === undefined ? sorted : sorted.slice(0, limit);
  if (shown.length === 0) {
    return (
      <p className="text-xs text-fg-muted">Nothing certain yet — every set of spies still fits.</p>
    );
  }
  return (
    <ul className="flex flex-col gap-1">
      {shown.map((d) => {
        const line = (
          <span className="flex items-start gap-2 text-xs text-fg-secondary">
            <Badge size="xs" tone={d.certainty === "proven" ? KIND_TONE[d.kind] : "neutral"}>
              {d.certainty === "proven" ? "Proven" : "Likely"}
            </Badge>
            <span className="min-w-0">{d.text}</span>
          </span>
        );
        return (
          <li key={`${d.kind}-${d.text}`}>
            {onExplain ? (
              <ExplainRow onClick={() => onExplain(d)} label={`Explain: ${d.text}`}>
                {line}
              </ExplainRow>
            ) : (
              line
            )}
          </li>
        );
      })}
    </ul>
  );
}
