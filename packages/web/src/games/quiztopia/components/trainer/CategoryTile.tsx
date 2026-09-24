import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRightIcon } from "../../../../components/icons";
import { InteractiveCard, MicroLabel, TONE_BUBBLE } from "../../../../components/ui";
import { DonutChart } from "../../../../components/ui/charts";
import { cn } from "../../../../lib/cn";
import { type District, TONE_LIT } from "../../bands";
import { BuildingGlyph } from "../common/BuildingGlyph";

// One district of the city as a card: glyph bubble (lit when the district
// has nothing due), two-digit label, name, building, and whatever the
// screen puts underneath — due/new badges on the hub, the read share in the
// archive. The whole card is one link; the optional corner link is a
// SIBLING positioned over it, never nested (a link inside a link is
// invalid and unreachable by keyboard).

type Props = {
  district: District;
  to: string;
  lit: boolean;
  /** Mastery 0..1 — the small ring in the top-right corner. */
  ring?: number;
  /** Badge row / progress line under the name. */
  children?: ReactNode;
  cta: string;
  corner?: { to: string; label: string };
  className?: string;
};

export function CategoryTile({
  district: d,
  to,
  lit,
  ring,
  children,
  cta,
  corner,
  className,
}: Props) {
  const pct = ring === undefined ? null : Math.round(ring * 100);
  return (
    // The lift lives on the wrapper so the corner link (a sibling — links
    // cannot nest) rises with the card instead of staying behind.
    <div
      className={cn(
        "relative transition-transform duration-150 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        className,
      )}
    >
      <InteractiveCard
        as={Link}
        to={to}
        padding="sm"
        className={cn("flex h-full flex-col gap-3", lit && cn("border", TONE_LIT[d.tone]))}
      >
        <div className="flex items-start justify-between gap-2">
          <span
            className={cn(
              "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors",
              lit ? TONE_BUBBLE[d.tone] : "bg-fill text-fg-muted",
            )}
          >
            <BuildingGlyph name={d.building} lit={lit} size={24} />
          </span>
          {pct !== null && (
            <DonutChart
              size={40}
              thickness={5}
              segments={[
                { value: pct, tone: d.tone, label: "Mastered" },
                { value: 100 - pct, color: "transparent" },
              ]}
            >
              {/* pl-px / pb-px: half-pixel optical nudge — the % glyph's right
                  bearing and the digits' baseline put the ink left and low. */}
              <span className="pb-px pl-px text-3xs font-semibold tabular-nums text-fg-secondary">
                {pct}%
              </span>
            </DonutChart>
          )}
        </div>
        <div className="min-w-0">
          <MicroLabel>
            {d.label} · {d.buildingLabel}
          </MicroLabel>
          <p className="truncate text-sm font-semibold text-fg-strong">{d.en}</p>
        </div>
        {children}
        <span className="mt-auto flex items-center gap-1 pt-1 text-3xs font-semibold text-accent-300">
          {cta}
          <ArrowRightIcon className="h-2.5 w-2.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </InteractiveCard>
      {corner && (
        <Link
          to={corner.to}
          className="absolute bottom-3 right-3 z-lift rounded-ui-md px-1.5 py-0.5 text-2xs font-medium text-fg-muted transition-colors hover:bg-fill hover:text-fg-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400/60"
        >
          {corner.label}
        </Link>
      )}
    </div>
  );
}
