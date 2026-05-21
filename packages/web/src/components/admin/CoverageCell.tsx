import type { Coverage } from "../../pages/admin-coverage";

// Coverage colors. Match the calendar's two-status semantics:
//   accent-400  → "can"
//   amber-400   → "maybe"
//   surface gray → unmarked
const COLOR_CAN = "#818cf8";
const COLOR_MAYBE = "#fbbf24";
const COLOR_UNMARKED = "#374151";

type Props = { coverage: Coverage };

/**
 * Pie-slice dot + percentage label for one user's coverage of the editable
 * 42-day window. The conic-gradient on the dot mirrors the three buckets
 * (can / maybe / unmarked) so a single glance reads as "how much of the
 * coming six weeks has this user weighed in on".
 */
export function CoverageCell({ coverage }: Props) {
  const { can, maybe, total } = coverage;
  const canPct = total > 0 ? (can / total) * 100 : 0;
  const maybePct = total > 0 ? (maybe / total) * 100 : 0;
  const canEnd = canPct;
  const maybeEnd = canPct + maybePct;
  const coverPct = Math.round(canPct + maybePct);
  const title =
    total === 0
      ? "No editable days"
      : `${can} can · ${maybe} maybe · ${total - can - maybe} unmarked of ${total} editable days`;
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        title={title}
        className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-white/10"
        style={{
          background: `conic-gradient(${COLOR_CAN} 0 ${canEnd}%, ${COLOR_MAYBE} ${canEnd}% ${maybeEnd}%, ${COLOR_UNMARKED} ${maybeEnd}% 100%)`,
        }}
      />
      <span className="text-xs tabular-nums text-gray-400">{coverPct}%</span>
    </span>
  );
}
