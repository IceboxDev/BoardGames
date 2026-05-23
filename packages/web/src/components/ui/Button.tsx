import type { ButtonHTMLAttributes, Ref } from "react";

// The single text-button primitive. Owns disabled, focus-visible ring, the
// gradient/surface/ghost/danger/warning palette, the four sizes, and an
// optional pill shape. Every catalog/admin/form CTA in the app routes
// through here so palette changes happen in one place. Pure icon buttons
// (close X, edit, delete) live in `IconButton.tsx`; toggle / picker chips
// live in `Chip.tsx`.

type Variant = "primary" | "secondary" | "ghost" | "danger" | "warning" | "link";
type Size = "xs" | "sm" | "md" | "lg";
type Shape = "rounded" | "pill";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  /** Rounded corners (default) or full-pill. */
  shape?: Shape;
  loading?: boolean;
  /** Stretch to fill the parent — convenience over `className="w-full"`. */
  block?: boolean;
  ref?: Ref<HTMLButtonElement>;
};

const BASE =
  "inline-flex items-center justify-center gap-2 font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400/60 disabled:cursor-not-allowed disabled:opacity-50";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-gradient-to-r from-accent-500 to-neon-purple text-white shadow-lg shadow-accent-500/20 hover:shadow-accent-500/40 hover:brightness-110 active:scale-[0.98]",
  secondary:
    "bg-surface-800 text-gray-100 border border-white/10 hover:bg-surface-700 hover:border-white/20",
  // text-only with a subtle background on hover — used for "Cancel" /
  // "Close" / inline-row actions that need to read as low-emphasis but
  // still surface a hover affordance.
  ghost: "text-gray-300 hover:bg-white/5 hover:text-white",
  // Subtle, tinted destructive — for "Remove" / "Delete row" style
  // actions that aren't immediate destruction. Use this, not raw
  // rose-500. The `danger` IconButton variant covers the icon-only case.
  danger:
    "bg-rose-500/15 text-rose-200 border border-rose-400/40 hover:bg-rose-500/25 hover:border-rose-400/60",
  // Amber-tinted attention button — used for lock-in actions and other
  // "advisory" calls to action that aren't destructive but are weightier
  // than a primary CTA.
  warning:
    "bg-amber-500/15 text-amber-100 border border-amber-400/40 hover:bg-amber-500/25 hover:border-amber-300/60",
  // Pure text link — no background, just color hover. Used by "Leave Room"
  // / "Back" / "Reset" style passive affordances inside action surfaces
  // where a bordered button would feel too heavy.
  link: "text-gray-500 transition-colors hover:text-gray-300",
};

const SIZES: Record<Size, string> = {
  // xs is for inline-row actions (Eliminate / Revive / Kick) where the
  // surrounding row is text-xs and a sm button would feel too tall.
  xs: "px-2 py-1 text-xs",
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-3 text-base",
};

const SHAPES: Record<Shape, string> = {
  rounded: "rounded-lg",
  pill: "rounded-full",
};

export function Button({
  variant = "primary",
  size = "md",
  shape = "rounded",
  loading = false,
  block = false,
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
  // `link` variant strips chrome — drop the size padding for it so the
  // text sits in the surrounding flow without a button-sized hit area
  // bleeding into adjacent content. Callers can still pass `className`
  // to add their own spacing.
  const sizeCls = variant === "link" ? "text-xs" : SIZES[size];
  const shapeCls = variant === "link" ? "" : SHAPES[shape];
  const widthCls = block ? "w-full" : "";
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={`${BASE} ${VARIANTS[variant]} ${sizeCls} ${shapeCls} ${widthCls} ${className}`}
      {...rest}
    >
      {loading ? <span className="animate-pulse">…</span> : children}
    </button>
  );
}
