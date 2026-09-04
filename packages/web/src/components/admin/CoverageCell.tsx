import type { Coverage } from "../../pages/admin-coverage";
// Leaf import: this file wants one tone→hex helper, not the chart primitives,
// so it names the module that has it rather than the barrel.
import { chartHex } from "../ui/charts/tone-hex";
import { coverageBreakdown, coveragePercent } from "./coverage-summary";

// Coverage colors. The dot echoes the calendar's two-status semantics —
// indigo for "can", yellow for "maybe" — but NOT its exact steps: the calendar
// paints maybe in yellow-400/amber-300 and AvailabilityDrawer's legend uses
// accent-300/amber-300.
//   accent-400  → "can"
//   chart amber → "maybe"  (NB: chartHex("accent") is accent-500 / #6366f1,
//                           a darker step than this dot's accent-400 — do not
//                           "symmetrize" COLOR_CAN to it.)
//   surface gray → unmarked
// The var fallback mirrors --color-accent-400 in index.css — keep the two in
// sync (same contract as lib/accent.ts's DEFAULT_ACCENT). It matters because a
// bare var() that failed to resolve would void the whole conic-gradient.
const COLOR_CAN = "var(--color-accent-400, #818cf8)";
const COLOR_MAYBE = chartHex("amber");
// The v3-era gray-700 the unmarked slice has always used. Deliberately NOT
// `var(--color-gray-700)`: Tailwind v4's oklch palette resolves that variable
// to rgb(54,65,83), not this exact value, and no surface/fg token matches it.
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
  // Arc stops stay full-precision — only the label rounds (via coveragePercent),
  // so a slice never visibly disagrees with the number beside it.
  const canEnd = total > 0 ? (can / total) * 100 : 0;
  const maybeEnd = total > 0 ? ((can + maybe) / total) * 100 : 0;
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        title={coverageBreakdown(coverage)}
        className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-white/10"
        style={{
          background: `conic-gradient(${COLOR_CAN} 0 ${canEnd}%, ${COLOR_MAYBE} ${canEnd}% ${maybeEnd}%, ${COLOR_UNMARKED} ${maybeEnd}% 100%)`,
        }}
      />
      <span className="text-xs tabular-nums text-fg-secondary">{coveragePercent(coverage)}%</span>
    </span>
  );
}
