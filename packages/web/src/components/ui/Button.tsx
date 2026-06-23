import type { ButtonHTMLAttributes, Ref } from "react";

// The single text-button primitive. Owns disabled, focus-visible ring, the
// palette, sizes, and an optional pill shape. Every catalog/admin/form/game
// CTA routes through here so palette changes happen in one place. Pure icon
// buttons (close X, edit, delete) live in `IconButton.tsx`; toggle / picker
// chips live in `Chip.tsx`.
//
// Two axes describe a button:
//   • variant — the *shape/emphasis*: the brand `primary` gradient, the
//     `secondary` bordered surface, low-emphasis `ghost`, inline `link`, and
//     the two color-bearing shapes `tinted` (subtle bordered tint) and `solid`
//     (filled single color).
//   • tone — the *color* for `tinted`/`solid` (and an override for the
//     `danger`/`warning`/`success` aliases). One tinted formula, eight tones.
//
//   `danger`/`warning`/`success` are kept as ergonomic aliases for the three
//   canonical tones (rose/amber/emerald) so existing call sites keep working;
//   internally they ARE `tinted` at that tone — one source of truth.
//
// TRAP for future edits: do NOT add game-specific named variants (a "combo"
// purple, a "sushi" orange). Those are tones — `variant="tinted" tone="purple"`
// — so the global primitive never accretes per-game vocabulary.
//
//   fill  — strip padding/shape/gap and stretch to fill the parent (h/w-full).
//           For grid/matrix cells that are themselves the clickable surface
//           (the tournament matrix). Compose multi-line content with a child
//           wrapper; the button just provides the full-bleed hit area.
//   align — `center` (default) or `start` for left-aligned menu-row buttons.

type StructuralVariant = "primary" | "secondary" | "ghost" | "link";
type TintedAlias = "danger" | "warning" | "success";
type Variant = StructuralVariant | TintedAlias | "tinted" | "solid" | "plain";
export type ButtonTone =
  | "accent"
  | "emerald"
  | "rose"
  | "amber"
  | "purple"
  | "orange"
  | "sky"
  | "cyan";
type Size = "xs" | "sm" | "md" | "lg";
type Shape = "rounded" | "pill" | "square";
type Align = "center" | "start";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  /** Color for `tinted`/`solid` (also overrides danger/warning/success). */
  tone?: ButtonTone;
  size?: Size;
  /** Rounded corners (default) or full-pill. Ignored when `fill`/`link`. */
  shape?: Shape;
  /** Content justification — `start` for menu-row buttons. */
  align?: Align;
  loading?: boolean;
  /** Stretch to fill the parent — convenience over `className="w-full"`. */
  block?: boolean;
  /** Full-bleed clickable cell: fill parent, drop padding/shape/gap. */
  fill?: boolean;
  ref?: Ref<HTMLButtonElement>;
};

const BASE =
  "items-center font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400/60 disabled:cursor-not-allowed disabled:opacity-50";

// Color classes are written as full literals — Tailwind cannot see a class name
// assembled at runtime (`bg-${tone}-500`), so every tone is spelled out.
const STRUCTURAL: Record<StructuralVariant, string> = {
  primary:
    "bg-gradient-to-r from-accent-500 to-neon-purple text-white shadow-lg shadow-accent-500/20 hover:shadow-accent-500/40 hover:brightness-110 active:scale-[0.98]",
  secondary:
    "bg-surface-800 text-fg-primary border border-white/10 hover:bg-surface-700 hover:border-white/20",
  // text-only with a subtle background on hover — "Cancel" / "Close" / inline.
  ghost: "text-fg-secondary hover:bg-white/5 hover:text-white",
  // Pure text link — no background, just color hover. "Leave Room" / "Back".
  link: "text-fg-muted transition-colors hover:text-fg-secondary",
};

// Subtle bordered tint — the shape danger/warning/success share. One formula.
const TINTED: Record<ButtonTone, string> = {
  accent:
    "bg-accent-500/15 text-accent-200 border border-accent-400/40 hover:bg-accent-500/25 hover:border-accent-300/60",
  emerald:
    "bg-emerald-500/15 text-emerald-200 border border-emerald-400/40 hover:bg-emerald-500/25 hover:border-emerald-300/60",
  rose: "bg-rose-500/15 text-rose-200 border border-rose-400/40 hover:bg-rose-500/25 hover:border-rose-300/60",
  amber:
    "bg-amber-500/15 text-amber-200 border border-amber-400/40 hover:bg-amber-500/25 hover:border-amber-300/60",
  purple:
    "bg-purple-500/15 text-purple-200 border border-purple-400/40 hover:bg-purple-500/25 hover:border-purple-300/60",
  orange:
    "bg-orange-500/15 text-orange-200 border border-orange-400/40 hover:bg-orange-500/25 hover:border-orange-300/60",
  sky: "bg-sky-500/15 text-sky-200 border border-sky-400/40 hover:bg-sky-500/25 hover:border-sky-300/60",
  cyan: "bg-cyan-500/15 text-cyan-200 border border-cyan-400/40 hover:bg-cyan-500/25 hover:border-cyan-300/60",
};

// Filled single-color button (game action buttons: defuse, peek, start round).
// accent has no -600 token, so it fills at -500; amber/cyan are bright enough
// to need dark text.
const SOLID: Record<ButtonTone, string> = {
  accent: "bg-accent-500 text-white shadow-lg shadow-accent-500/20 hover:bg-accent-400",
  emerald: "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-500",
  rose: "bg-rose-600 text-white shadow-lg shadow-rose-500/20 hover:bg-rose-500",
  amber: "bg-amber-500 text-surface-950 shadow-lg shadow-amber-500/20 hover:bg-amber-400",
  purple: "bg-purple-600 text-white shadow-lg shadow-purple-500/20 hover:bg-purple-500",
  orange: "bg-orange-600 text-white shadow-lg shadow-orange-500/20 hover:bg-orange-500",
  sky: "bg-sky-600 text-white shadow-lg shadow-sky-500/20 hover:bg-sky-500",
  cyan: "bg-cyan-500 text-surface-950 shadow-lg shadow-cyan-500/20 hover:bg-cyan-400",
};

const SIZE_PAD: Record<Size, string> = {
  // xs is for inline-row actions (Eliminate / Revive / Kick).
  xs: "px-2 py-1",
  sm: "px-3 py-1.5",
  md: "px-4 py-2",
  lg: "px-5 py-3",
};

const SIZE_TEXT: Record<Size, string> = {
  xs: "text-xs",
  sm: "text-sm",
  md: "text-sm",
  lg: "text-base",
};

const SHAPES: Record<Shape, string> = {
  rounded: "rounded-lg",
  pill: "rounded-full",
  // Square corners — abutting menu rows / segmented cells.
  square: "rounded-none",
};

function colorFor(variant: Variant, tone: ButtonTone | undefined): string {
  switch (variant) {
    case "tinted":
      return TINTED[tone ?? "accent"];
    case "solid":
      return SOLID[tone ?? "accent"];
    case "danger":
      return TINTED[tone ?? "rose"];
    case "warning":
      return TINTED[tone ?? "amber"];
    case "success":
      return TINTED[tone ?? "emerald"];
    case "plain":
      // No skin — focus ring + disabled only. For `fill` cells / custom
      // clickable surfaces that supply their own hover/text via `className`
      // without fighting a variant's colors.
      return "";
    default:
      return STRUCTURAL[variant];
  }
}

export function Button({
  variant = "primary",
  tone,
  size = "md",
  shape = "rounded",
  align = "center",
  loading = false,
  block = false,
  fill = false,
  className = "",
  // Default to "button", NOT the native "submit". A bare <button> inside a
  // <form> implicitly submits it, so an action button (Cancel / Remove)
  // sharing a form with a submit button would fire both the click handler
  // and the form submit on a single click — racing two mutations. Forms
  // that need a submit button opt in with an explicit type="submit".
  type = "button",
  children,
  disabled,
  ref,
  ...rest
}: Props) {
  const colorCls = colorFor(variant, tone);
  const alignCls = align === "start" ? "justify-start" : "justify-center";

  // `link` strips chrome so text sits in the surrounding flow; `fill` turns the
  // button into a padding-less, shape-less surface that fills its parent cell.
  let layoutCls: string;
  if (fill) {
    layoutCls = `flex h-full w-full p-0 ${SIZE_TEXT[size]} ${alignCls}`;
  } else if (variant === "link") {
    layoutCls = `inline-flex gap-2 text-xs ${alignCls}`;
  } else {
    layoutCls = `inline-flex gap-2 ${SIZE_PAD[size]} ${SIZE_TEXT[size]} ${SHAPES[shape]} ${alignCls}`;
  }

  const widthCls = block && !fill ? "w-full" : "";

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={`${BASE} ${colorCls} ${layoutCls} ${widthCls} ${className}`}
      {...rest}
    >
      {loading ? <span className="animate-pulse">…</span> : children}
    </button>
  );
}
