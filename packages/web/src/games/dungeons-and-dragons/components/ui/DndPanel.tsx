import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

// ── DndPanel ─────────────────────────────────────────────────────────────
//
// The DM tool's bordered panel. The one chain
//
//   rounded-2xl border border-amber-400/20
//   bg-gradient-to-br from-dnd-ash/80 via-surface-900/90 to-black/80 p-3
//
// was hand-spelled ~17 times across 7 files, in TWELVE variants that differed
// only in gradient opacity (/60 /70 /80 /90), padding (p-3, p-3.5, p-4, p-5,
// px-4 py-3), and whether a hover border was tacked on. That is drift, not
// design, so the axes are props now.
//
// Deliberately NOT the global `Surface`: that primitive is a flat neutral
// `bg-surface-900` panel and the amber-gradient parchment look is specific to
// this tool. Pushing this into components/ui/ would give every other screen a
// gradient variant it must never use.
//
// `as` makes the panel a <button> or <li> without losing the chrome. Inner
// layout (flex, gap, grid) stays the caller's job via `className`.

export type DndPanelTone = "amber" | "rose" | "emerald" | "arcane";
export type DndPanelPadding = "none" | "sm" | "md" | "lg" | "xl";

// Border and fill are separate axes because the app genuinely uses them apart:
// a failed character card is a ROSE border over the standard ASH parchment.
// They must not be merged into one class string and then "overridden" via
// `className` — two `border-*-400/*` classes land in the same CSS layer, and
// Tailwind's generated order, not the caller, would decide the winner.
const BORDERS: Record<DndPanelTone, string> = {
  amber: "border-amber-400/20",
  rose: "border-rose-400/30",
  emerald: "border-emerald-400/25",
  arcane: "border-purple-400/25",
};

const FILLS: Record<DndPanelTone, string> = {
  amber: "bg-gradient-to-br from-dnd-ash/80 via-surface-900/90 to-black/80",
  rose: "bg-gradient-to-br from-dnd-blood/70 via-black/30 to-black/40",
  emerald: "bg-gradient-to-br from-dnd-rest/70 via-surface-900/85 to-black/80",
  arcane: "bg-gradient-to-br from-dnd-arcane/60 via-black/30 to-black/40",
};

/** Hover treatment for panels that are themselves the click target. */
const HOVER: Record<DndPanelTone, string> = {
  amber: "transition-colors hover:border-amber-400/45",
  rose: "transition-colors hover:border-rose-300/60",
  emerald: "transition-colors hover:border-emerald-300/60",
  arcane: "transition-colors hover:border-purple-300/60",
};

const PADDINGS: Record<DndPanelPadding, string> = {
  none: "",
  sm: "p-3",
  md: "p-3.5",
  lg: "p-4",
  xl: "p-5",
};

type OwnProps<T extends ElementType> = {
  as?: T;
  /** Sets both border and fill. */
  tone?: DndPanelTone;
  /** Override just the border colour, keeping `tone`'s fill. */
  border?: DndPanelTone;
  padding?: DndPanelPadding;
  /** Adds the border tone's hover colour. For panels that are the click target. */
  interactive?: boolean;
  /** `2xl` (default) or the tighter `xl` used by inner cards. */
  radius?: "xl" | "2xl";
  className?: string;
  children: ReactNode;
};

type DndPanelProps<T extends ElementType> = OwnProps<T> &
  Omit<ComponentPropsWithoutRef<T>, keyof OwnProps<T>>;

export function DndPanel<T extends ElementType = "div">({
  as,
  tone = "amber",
  border,
  padding = "sm",
  interactive = false,
  radius = "2xl",
  className = "",
  children,
  ...rest
}: DndPanelProps<T>) {
  const Tag = (as ?? "div") as ElementType;
  const borderTone = border ?? tone;
  const cls = [
    radius === "2xl" ? "rounded-2xl" : "rounded-xl",
    "border",
    BORDERS[borderTone],
    FILLS[tone],
    PADDINGS[padding],
    interactive ? HOVER[borderTone] : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const typeProp = Tag === "button" ? { type: "button" as const } : {};
  return (
    <Tag className={cls} {...typeProp} {...rest}>
      {children}
    </Tag>
  );
}
