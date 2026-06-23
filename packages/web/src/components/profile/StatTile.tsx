import type { ReactNode } from "react";

// Compact label + value tile used in the profile header's quick-stats row and
// the stats panel. Keeps the metric typography consistent everywhere a number
// is surfaced on a profile.

type StatTileProps = {
  label: string;
  value: ReactNode;
  /** Optional secondary line under the value (e.g. "of 12 played"). */
  sub?: ReactNode;
  icon?: ReactNode;
};

export function StatTile({ label, value, sub, icon }: StatTileProps) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-white/[0.06] bg-surface-900/60 px-3 py-2.5">
      <span className="flex items-center gap-1 text-3xs font-semibold uppercase tracking-[0.16em] text-fg-muted">
        {icon}
        {label}
      </span>
      <span className="text-xl font-bold tabular-nums text-white">{value}</span>
      {sub && <span className="text-3xs text-fg-muted">{sub}</span>}
    </div>
  );
}
