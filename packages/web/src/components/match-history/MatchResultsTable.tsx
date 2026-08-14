import type { ReactNode } from "react";

// The single results-table kit shared by solo Match History and the tournament
// game list. The two screens used to be ~95% copy-pasted files (container,
// heading, W/L/D tally, `<table>` chrome, and every cell class chain) that had
// already drifted — one had the `relative z-10` stacking fix for the fixed
// game background, the other didn't. Columns are data; chrome lives here once.

// ── MatchResultsLayout ───────────────────────────────────────────────────
//
// Outer container + centered heading. `relative z-10` is load-bearing: these
// screens render inside `GameShellLayoutInner`, which paints a fixed
// `def.backgroundImage` at z-0 over the whole main area — without a stacking
// context the background covers this static content.

export function MatchResultsLayout({
  title,
  tally,
  footer,
  children,
}: {
  title: ReactNode;
  /** The "<n> games · xW / yL / zD" line — use <MatchTally>. */
  tally?: ReactNode;
  /** Bottom action row (Back button, export). */
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="relative z-10 mx-auto flex w-full max-w-4xl flex-col items-center gap-6 px-4 py-8">
      <div className="text-center">
        <h2 className="text-2xl font-extrabold text-white">{title}</h2>
        {tally}
      </div>
      {children}
      {footer}
    </div>
  );
}

// ── MatchTally ───────────────────────────────────────────────────────────

export function MatchTally({
  total,
  wins,
  losses,
  draws,
  suffix,
}: {
  total: number;
  wins: number;
  losses: number;
  draws: number;
  /** Trailing context, e.g. " for Greedy" on tournament pairings. */
  suffix?: ReactNode;
}) {
  return (
    <p className="mt-2 text-sm text-fg-secondary">
      {total} games &middot; <span className="text-emerald-400">{wins}W</span> /{" "}
      <span className="text-rose-400">{losses}L</span> /{" "}
      <span className="text-fg-secondary">{draws}D</span>
      {suffix}
    </p>
  );
}

// ── MatchResultsTable ────────────────────────────────────────────────────

export type MatchOutcome = "win" | "loss" | "draw";

/** The opposing side's outcome — was pasted byte-identically into both
 *  match-history consumers before living here beside `scoreToneClass`. */
export function invertOutcome(o: MatchOutcome): MatchOutcome {
  return o === "win" ? "loss" : o === "loss" ? "win" : "draw";
}

/** Cell class for a score belonging to the given outcome's side. */
export function scoreToneClass(outcome: MatchOutcome): string {
  if (outcome === "win") return "text-emerald-400";
  if (outcome === "loss") return "text-rose-400";
  return "text-fg-secondary";
}

/** Colored result label ("Win" / "Loss" / a strategy name / "Draw"). */
export function ResultText({ outcome, children }: { outcome: MatchOutcome; children: ReactNode }) {
  const cls =
    outcome === "win" ? "text-emerald-400" : outcome === "loss" ? "text-rose-400" : "text-fg-muted";
  return <span className={cls}>{children}</span>;
}

/** Signed score-difference text ("+12" / "-3" / "0"). */
export function formatDiff(diff: number): string {
  return `${diff > 0 ? "+" : ""}${diff}`;
}

type Align = "left" | "right" | "center";

const ALIGN_CLASSES: Record<Align, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

export type MatchColumn<Row> = {
  /** Stable column id (header key). */
  id: string;
  header: ReactNode;
  /** Cell alignment; defaults to left. */
  align?: Align;
  /** Extra classes on every body cell — static, or derived from the row
   *  (score coloring via `scoreToneClass`). */
  cellClassName?: string | ((row: Row, index: number) => string);
  cell: (row: Row, index: number) => ReactNode;
};

export function MatchResultsTable<Row>({
  columns,
  rows,
  rowKey,
  onSelectRow,
}: {
  columns: MatchColumn<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row, index: number) => string | number;
  /** Makes rows clickable (replay navigation). */
  onSelectRow?: (row: Row, index: number) => void;
}) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-white/10 text-xs font-medium uppercase tracking-wider text-fg-muted">
            {columns.map((c) => (
              <th key={c.id} className={`p-2.5 ${ALIGN_CLASSES[c.align ?? "left"]}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={rowKey(row, i)}
              onClick={onSelectRow ? () => onSelectRow(row, i) : undefined}
              className={`border-b border-white/10 transition-colors ${
                onSelectRow ? "cursor-pointer hover:bg-surface-800/50" : ""
              }`}
            >
              {columns.map((c) => {
                const extra =
                  typeof c.cellClassName === "function"
                    ? c.cellClassName(row, i)
                    : (c.cellClassName ?? "");
                return (
                  <td
                    key={c.id}
                    className={["p-2.5", ALIGN_CLASSES[c.align ?? "left"], extra]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {c.cell(row, i)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
