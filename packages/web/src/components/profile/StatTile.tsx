import type { ReactNode } from "react";
import { MicroLabel } from "../ui/Label";
import { Surface } from "../ui/Surface";

// Compact label + value tile — the one place a metric is typeset on a profile.
// Used by `ProfileHeader`'s quick-stats row. Chrome comes from `Surface`
// (`raised`); this component owns only the metric typography, so a caption plus
// a big number reads identically wherever it appears.

type StatTileProps = {
  label: string;
  value: ReactNode;
  /** Optional secondary line under the value (e.g. "of 12 played"). */
  sub?: ReactNode;
  icon?: ReactNode;
};

export function StatTile({ label, value, sub, icon }: StatTileProps) {
  return (
    <Surface
      variant="raised"
      padding="none"
      className="flex flex-col items-center gap-0.5 px-3 py-2.5 text-center"
    >
      <MicroLabel className="flex items-center gap-1 font-semibold">
        {icon}
        {label}
      </MicroLabel>
      <span className="text-xl font-bold tabular-nums text-white">{value}</span>
      {sub && <span className="text-3xs text-fg-muted">{sub}</span>}
    </Surface>
  );
}
