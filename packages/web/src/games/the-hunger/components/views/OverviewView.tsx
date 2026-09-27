import { graphFor } from "@boardgames/core/games/the-hunger/board";
import { Fragment, useMemo } from "react";
import { Surface } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import type { HungerInteraction } from "../../logic/interaction";
import { seatLabel } from "../../logic/labels";
import { leaders, overviewMetrics } from "../../logic/metrics";
import HungerIcon from "../HungerIcon";
import VampireAvatar from "../VampireAvatar";

/**
 * Every Vampire side by side on every public metric: one column each, one
 * row per metric, the strict leader of each row lit.
 */
export default function OverviewView({
  ix,
  names,
}: {
  ix: HungerInteraction;
  names: readonly (string | null)[];
}) {
  const { view, activeSeat } = ix;
  const g = graphFor(view.options);
  const sections = useMemo(() => overviewMetrics(view, g, activeSeat), [view, g, activeSeat]);
  const cols = view.players.length;
  // Header, a title per section, a row per metric: stretched to fill the view.
  const rows = 1 + sections.reduce((n, s) => n + 1 + s.rows.length, 0);

  return (
    <Surface variant="raised" padding="none" className="min-h-0 flex-1 overflow-auto">
      <div
        className="grid min-h-full min-w-max text-xs 2xl:text-sm"
        style={{
          gridTemplateColumns: `minmax(11rem, 14rem) repeat(${cols}, minmax(8rem, 1fr))`,
          gridTemplateRows: `auto repeat(${rows - 1}, minmax(1.375rem, 1fr))`,
        }}
      >
        {/* Header row: the Vampires. */}
        <div className="sticky left-0 top-0 z-raised-2 border-b border-line bg-surface-900 px-4 py-3" />
        {view.players.map((p) => (
          <div
            key={p.index}
            className={cn(
              "sticky top-0 z-raised flex flex-col items-center gap-1 border-b border-line bg-surface-900 px-3 py-2",
              p.index === activeSeat && "bg-fill-strong",
            )}
          >
            <VampireAvatar vampire={p.vampire} className="h-12 w-12 text-lg" />
            <span className="text-center font-semibold text-fg-strong">
              {seatLabel(view, p.index, names)}
            </span>
          </div>
        ))}

        {sections.map((section) => (
          <Fragment key={section.title}>
            <div
              className="sticky left-0 z-lift border-b border-line-soft bg-surface-950/90 flex items-end px-4 pb-1 pt-2 text-3xs font-semibold uppercase tracking-label text-accent-300"
              style={{ gridColumn: `1 / span ${cols + 1}` }}
            >
              {section.title}
            </div>
            {section.rows.map((row) => {
              const lead = leaders(row);
              return (
                <Fragment key={row.label}>
                  <div
                    className="sticky left-0 z-lift flex items-center border-b border-line-soft bg-surface-900 px-4 py-0.5 text-fg-secondary"
                    title={row.hint}
                  >
                    {row.icon && (
                      <HungerIcon name={row.icon} className="mr-2 h-4 w-4 text-fg-muted" />
                    )}
                    {row.label}
                  </div>
                  {row.values.map((v, seat) => (
                    <div
                      // biome-ignore lint/suspicious/noArrayIndexKey: one cell per seat, in seat order
                      key={seat}
                      className={cn(
                        "flex items-center justify-center border-b border-line-soft px-3 py-0.5 tabular-nums",
                        seat === activeSeat && "bg-fill",
                        lead.has(seat)
                          ? "font-bold text-amber-200"
                          : typeof v === "number"
                            ? "text-fg-primary"
                            : "text-fg-secondary",
                      )}
                    >
                      {lead.has(seat) && (
                        <span className="mr-1 text-3xs" title="Leads this row">
                          ▲<span className="sr-only">leads:</span>
                        </span>
                      )}
                      {v}
                    </div>
                  ))}
                </Fragment>
              );
            })}
          </Fragment>
        ))}
      </div>
    </Surface>
  );
}
