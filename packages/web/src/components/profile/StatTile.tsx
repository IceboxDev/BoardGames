import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRightIcon } from "../icons";
import { InteractiveCard } from "../ui/InteractiveCard";
import { MicroLabel } from "../ui/Label";
import { Surface } from "../ui/Surface";

// Compact label + value tile — the one place a metric is typeset on a profile.
// Used by `ProfileHeader`'s quick-stats row. Three modes sharing one metric
// typography:
//   - plain: static `Surface` (raised) — the original tile.
//   - `to`: a NAVIGATION button (`InteractiveCard as={Link}`) with a
//     persistent CTA row — hover-only affordances fail on touch, and these
//     tiles must read as very-clearly-clickable. Renders a link role, never a
//     button (ProfileHeader's tests pin button queries to Edit-profile only).
//   - `soon`: same tile anatomy with a muted "Soon" row where the CTA would
//     be, so a not-yet-built sub-page keeps the 4-tile grid uniform.

type StatTileProps = {
  label: string;
  value: ReactNode;
  /** Optional secondary line under the value (e.g. "of 12 played"). */
  sub?: ReactNode;
  icon?: ReactNode;
  /** Navigation target — turns the tile into a link card with a CTA row. */
  to?: string;
  /** CTA row text (link mode only). */
  cta?: string;
  /** Placeholder mode: CTA slot shows a muted "Soon", tile stays inert. */
  soon?: boolean;
};

const TILE_LAYOUT = "flex flex-col items-center gap-0.5 px-3 py-2.5 text-center";

export function StatTile({
  label,
  value,
  sub,
  icon,
  to,
  cta = "View",
  soon = false,
}: StatTileProps) {
  const metric = (
    <>
      <MicroLabel className="flex items-center gap-1 font-semibold">
        {icon}
        {label}
      </MicroLabel>
      <span className="text-xl font-bold tabular-nums text-white">{value}</span>
      {sub && <span className="text-3xs text-fg-muted">{sub}</span>}
    </>
  );

  // The grid stretches every tile to the tallest sibling; `h-full` + `mt-auto`
  // on the bottom row pins each CTA/Soon slot to the same baseline no matter
  // whether the tile above it carries a sub line.
  if (to) {
    return (
      <InteractiveCard
        as={Link}
        to={to}
        padding="none"
        className={`${TILE_LAYOUT} h-full hover:-translate-y-0.5`}
      >
        {metric}
        <span className="mt-auto flex items-center gap-1 pt-1 text-3xs font-semibold text-accent-300">
          {cta}
          <ArrowRightIcon className="h-2.5 w-2.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </InteractiveCard>
    );
  }

  return (
    <Surface variant="raised" padding="none" className={`${TILE_LAYOUT} h-full`}>
      {metric}
      {soon && (
        <span className="mt-auto pt-1 text-3xs font-semibold uppercase tracking-pill text-fg-muted">
          Soon
        </span>
      )}
    </Surface>
  );
}
