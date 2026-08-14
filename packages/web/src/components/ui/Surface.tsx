import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

// ── Surface ──────────────────────────────────────────────────────────────
//
// The single bordered-panel primitive. Replaces the ~22 hand-rolled
// `rounded-* border border-white/… bg-surface-…` chains that drift across the
// app (profile cards, match-history forms, game-over panels). Three treatments
// capture the observed clusters:
//
//   tile   — dense, subtle inset (rounded-md, border-white/5, surface-900/40).
//            Per-player rows/cards inside forms.
//   panel  — standard solid panel (rounded-lg, border-white/10, surface-900).
//            The default; most chrome.
//   raised — prominent card (rounded-2xl, border-white/[0.06], surface-900/60).
//            Profile cards / hero surfaces.
//
// Deliberately SLOT-LESS: it owns chrome (radius/border/background/padding),
// nothing else. Inner layout (flex, gap, grid) is the caller's job via
// `className` — that is composition, not an escape hatch. Anything interactive
// (hover lift, selected ring) is `SelectableCard`, not here. `as` renders a
// semantic element (`article`/`section`/`li`) without losing the chrome.

export type SurfaceVariant = "panel" | "tile" | "raised";
export type SurfacePadding = "none" | "sm" | "md" | "lg" | "xl";
export type SurfaceRadius = "md" | "lg" | "xl" | "2xl";

type SurfaceProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  variant?: SurfaceVariant;
  padding?: SurfacePadding;
  /** Override the variant's default radius. Exists because real panels
   *  cluster on all four steps (rounded-xl alone had six hand-rolled
   *  spellings before this prop) — without it, callers route around the
   *  primitive entirely just to change a corner. */
  radius?: SurfaceRadius;
  children: ReactNode;
};

const VARIANTS: Record<SurfaceVariant, string> = {
  tile: "rounded-md border border-white/5 bg-surface-900/40",
  panel: "rounded-lg border border-white/10 bg-surface-900",
  raised: "rounded-2xl border border-white/[0.06] bg-surface-900/60",
};

const RADII: Record<SurfaceRadius, string> = {
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  "2xl": "rounded-2xl",
};

const PADDINGS: Record<SurfacePadding, string> = {
  none: "",
  sm: "p-2",
  md: "p-3",
  lg: "p-4",
  xl: "p-5",
};

export function Surface({
  as: Tag = "div",
  variant = "panel",
  padding = "md",
  radius,
  className = "",
  children,
  ...rest
}: SurfaceProps) {
  const cls = cn(VARIANTS[variant], radius && RADII[radius], PADDINGS[padding], className);
  return (
    <Tag className={cls} {...rest}>
      {children}
    </Tag>
  );
}
