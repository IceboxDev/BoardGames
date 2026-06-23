import type { ReactNode } from "react";

// ── PlayerRow ──────────────────────────────────────────────────────────────
//
// The repeated "name on the left, control on the right" row that every
// match-history outcome form hand-rolled: a flex row with a truncating name
// span (`flex-1 truncate text-sm`, optionally highlighted for the leader /
// winner) and a trailing control — a score `Input`, a `Chip` group, a status
// pill, etc.
//
// Presentational only: it owns layout + the name's highlight color, nothing
// game-specific. The `right` slot takes whatever control the form needs; the
// optional `actions` slot groups secondary buttons at the far right.

type PlayerRowProps = {
  name: ReactNode;
  /** Highlight the name (leader / winner) in amber. */
  highlight?: boolean;
  /** Escape hatch for non-standard name colors. Overrides `highlight`. */
  nameClassName?: string;
  /** Primary trailing control (score Input, Chip group, status pill). */
  right?: ReactNode;
  /** Secondary action buttons, grouped at the far right. */
  actions?: ReactNode;
  className?: string;
};

export function PlayerRow({
  name,
  highlight = false,
  nameClassName,
  right,
  actions,
  className = "",
}: PlayerRowProps) {
  const nameCls = nameClassName ?? (highlight ? "text-amber-200" : "text-fg-primary");
  return (
    <div className={`flex items-center gap-2 ${className}`.trimEnd()}>
      <span className={`flex-1 truncate text-sm ${nameCls}`}>{name}</span>
      {right}
      {actions && <div className="flex items-center gap-1">{actions}</div>}
    </div>
  );
}
