import type { ReactNode } from "react";
import { Surface } from "../ui/Surface";

interface GameOverStatsProps {
  children: ReactNode;
  columns?: 2 | 3 | 4;
}

// Grid wrapper for a row of `StatItem`s.
export function GameOverStats({ children, columns = 2 }: GameOverStatsProps) {
  const colsClass =
    columns === 4 ? "grid-cols-2 sm:grid-cols-4" : columns === 3 ? "grid-cols-3" : "grid-cols-2";

  return (
    <Surface variant="panel" padding="lg" className={`grid gap-3 ${colsClass}`}>
      {children}
    </Surface>
  );
}

// Centered value-over-label cell, for use inside a `GameOverStats` grid.
export function StatItem({
  label,
  value,
  highlight,
}: {
  label: ReactNode;
  value: ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className="text-center">
      <div className={`text-2xl font-bold ${highlight ? "text-amber-300" : "text-white"}`}>
        {value}
        {highlight && " ★"}
      </div>
      <div className="text-xs text-fg-muted">{label}</div>
    </div>
  );
}

// Boxed label-over-value tile — the standalone stat cell that game-over screens
// hand-rolled locally (Set's `StatCell`, Pandemic's disease tiles). `best` adds
// the amber ★ best-marker.
export function StatCell({
  label,
  value,
  best,
  className = "",
}: {
  label: ReactNode;
  value: ReactNode;
  best?: boolean;
  className?: string;
}) {
  return (
    <div className={`rounded-lg bg-surface-800 p-3 text-center ${className}`.trimEnd()}>
      <p className="text-xs uppercase tracking-wide text-fg-muted">{label}</p>
      <p className={`mt-1 text-lg font-bold ${best ? "text-amber-300" : "text-white"}`}>
        {value}
        {best && " ★"}
      </p>
    </div>
  );
}

// Label-left / value-right row — the `ScoreRow` pattern hand-rolled across
// game-over breakdowns. `highlight` bolds the total line.
export function LabelValueRow({
  label,
  value,
  highlight,
  className = "",
}: {
  label: ReactNode;
  value: ReactNode;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 text-sm ${className}`.trimEnd()}>
      <span className={highlight ? "font-semibold text-white" : "text-fg-secondary"}>{label}</span>
      <span
        className={`tabular-nums ${highlight ? "font-semibold text-white" : "text-fg-primary"}`}
      >
        {value}
      </span>
    </div>
  );
}
