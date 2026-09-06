import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "../../lib/cn";
import { ArrowRightIcon } from "../icons";
import { InteractiveCard } from "./InteractiveCard";
import { MicroLabel } from "./Label";
import { RADIUS_CARD_LG } from "./radii";
import { Surface } from "./Surface";
import { type CoreTone, TONE_TEXT } from "./tones";

// ── StatTile ─────────────────────────────────────────────────────────────
//
// The one place a metric is typeset: a micro-label caption, a tabular figure,
// an optional sub line. Seven near-copies used to exist (the profile header's
// tiles, the purchase insight tiles, two byte-identical `HeroCard`s, the
// records strip, the skill "by the numbers" cells, the game-over stat cell)
// at five different value sizes and three paddings. One component, three axes:
//
//   variant  raised (default) — the prominent card (Surface raised)
//            tile             — dense inset (Surface tile)
//            filled           — solid `bg-surface-800`, no border (game-over cells)
//            plain            — no chrome; for cells inside a parent Surface
//   size     the figure's type step, sm … 2xl (text-sm … text-2xl)
//   align    center (default) or start
//
// Three modes share the anatomy:
//   - plain:  static tile.
//   - `to`:   a NAVIGATION link card (`InteractiveCard as={Link}`) with a
//             persistent CTA row — hover-only affordances fail on touch, so
//             these must read as very-clearly-clickable. Renders a link role,
//             never a button.
//   - `soon`: the tile anatomy with a muted "Soon" row where the CTA would
//             be, so a not-yet-built sub-page keeps a grid uniform.
//
// `children` replaces the figure + sub with a free-form body under the label
// — the hero-card form (a donut + two lines, a streak with a flame).

export type StatTileVariant = "raised" | "tile" | "filled" | "plain";
export type StatTileSize = "sm" | "md" | "lg" | "xl" | "2xl";
export type StatTileTone = "neutral" | CoreTone;

type StatTileProps = {
  label: ReactNode;
  value?: ReactNode;
  /** Optional secondary line under the value (e.g. "of 12 played"). */
  sub?: ReactNode;
  /** Leading glyph inside the label. */
  icon?: ReactNode;
  variant?: StatTileVariant;
  size?: StatTileSize;
  /** Figure color. `neutral` is the strongest ink; a tone flags a state. */
  tone?: StatTileTone;
  align?: "center" | "start";
  /** Caption above (default) or below the figure. */
  labelPosition?: "top" | "bottom";
  /** Inner padding + rhythm: none (a cell inside a parent Surface), sm
   *  (dense grids), md, lg (hero cards). */
  padding?: "none" | "sm" | "md" | "lg";
  /** Navigation target — turns the tile into a link card with a CTA row. */
  to?: string;
  /** CTA row text (link mode only). */
  cta?: string;
  /** Placeholder mode: CTA slot shows a muted "Soon", tile stays inert. */
  soon?: boolean;
  className?: string;
  /** Free-form body replacing value + sub. */
  children?: ReactNode;
};

const SIZES: Record<StatTileSize, string> = {
  sm: "text-sm font-semibold",
  md: "text-base font-bold",
  lg: "text-lg font-bold",
  xl: "text-xl font-bold",
  "2xl": "text-2xl font-bold",
};

const PADDINGS = {
  none: "gap-0.5",
  sm: "gap-0.5 px-3 py-2.5",
  md: "gap-1 p-3",
  lg: "gap-2 p-4",
} as const;

export function StatTile({
  label,
  value,
  sub,
  icon,
  variant = "raised",
  size = "xl",
  tone = "neutral",
  align = "center",
  labelPosition = "top",
  padding = "sm",
  to,
  cta = "View",
  soon = false,
  className,
  children,
}: StatTileProps) {
  const layout = cn(
    "flex min-w-0 flex-col",
    PADDINGS[padding],
    align === "center" && "items-center text-center",
  );

  const caption = (
    <MicroLabel
      className={cn(
        "flex items-center gap-1 font-semibold",
        align === "center" && "justify-center",
      )}
    >
      {icon}
      {label}
    </MicroLabel>
  );

  const figure = children ?? (
    <>
      <span
        className={cn(
          "tabular-nums",
          SIZES[size],
          tone === "neutral" ? "text-fg-strong" : TONE_TEXT[tone],
        )}
      >
        {value}
      </span>
      {sub && <span className="max-w-full truncate text-3xs text-fg-muted">{sub}</span>}
    </>
  );

  const body =
    labelPosition === "top" ? (
      <>
        {caption}
        {figure}
      </>
    ) : (
      <>
        {figure}
        {caption}
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
        className={cn(layout, "h-full hover:-translate-y-0.5", className)}
      >
        {body}
        <span className="mt-auto flex items-center gap-1 pt-1 text-3xs font-semibold text-accent-300">
          {cta}
          <ArrowRightIcon className="h-2.5 w-2.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </InteractiveCard>
    );
  }

  const soonRow = soon && (
    <span className="mt-auto pt-1 text-3xs font-semibold uppercase tracking-pill text-fg-muted">
      Soon
    </span>
  );

  if (variant === "raised" || variant === "tile") {
    return (
      <Surface variant={variant} padding="none" className={cn(layout, "h-full", className)}>
        {body}
        {soonRow}
      </Surface>
    );
  }
  return (
    <div
      className={cn(
        layout,
        "h-full",
        variant === "filled" && `${RADIUS_CARD_LG} bg-surface-800`,
        className,
      )}
    >
      {body}
      {soonRow}
    </div>
  );
}
