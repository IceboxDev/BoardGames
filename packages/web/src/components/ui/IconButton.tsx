import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";

// Icon-only button primitive. Requires an `aria-label` at the type level
// (screen readers see no visible text), enforces square padding so the
// icon stays centered, and provides three tonal variants for the most
// common hover treatments: ghost (neutral), danger (rose), warning
// (amber). For pure unstyled "close X" inside Modal/Overlay we still
// use a raw `<button>` because the chrome there is portal-internal —
// see the `noRestrictedElements` overrides in `biome.json`.
//
// Use `IconButton` for: edit / delete row actions, expand toggles,
// admin / lock-in chrome buttons, +/- steppers in setup screens, modal
// dismiss chrome that isn't covered by Modal's built-in close X.

type Variant = "ghost" | "danger" | "warning" | "subtle" | "bordered";
type Size = "xs" | "sm" | "md" | "lg";
type Shape = "rounded" | "circle";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  /** Icon to render — typically one of the components in `components/icons`. */
  icon: ReactNode;
  /** Required: the only label a screen reader will see. */
  "aria-label": string;
  variant?: Variant;
  size?: Size;
  shape?: Shape;
  /** Optional visual `aria-pressed` highlight for toggle-style icon buttons. */
  pressed?: boolean;
  ref?: Ref<HTMLButtonElement>;
};

const BASE =
  "inline-flex shrink-0 items-center justify-center transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400/60 disabled:cursor-not-allowed disabled:opacity-40";

const VARIANTS: Record<Variant, string> = {
  ghost: "text-fg-secondary hover:bg-white/5 hover:text-white",
  danger: "text-rose-400 hover:bg-rose-500/10 hover:text-rose-200",
  warning: "text-amber-300 hover:bg-amber-400/10 hover:text-amber-100",
  // Subtle: neutral hover bg + slight text lift. For inline row actions
  // (edit / view) where the row already has its own hover treatment.
  subtle: "text-fg-secondary hover:bg-surface-800 hover:text-fg-primary",
  // Bordered: standalone affordance with a visible chrome — used by
  // floating action buttons (admin toggle, lock-in toggle) where the
  // button needs to read independently of any surrounding container.
  bordered:
    "border border-white/15 text-fg-secondary hover:border-white/30 hover:bg-white/5 hover:text-white",
};

// Square padding so the icon stays centered. The size scale matches Button's
// so an IconButton and a Button at the same `size` read as the same height.
const SIZES: Record<Size, string> = {
  xs: "h-6 w-6 p-1 text-xs",
  sm: "h-7 w-7 p-1.5 text-sm",
  md: "h-9 w-9 p-2 text-sm",
  lg: "h-11 w-11 p-2.5 text-base",
};

const SHAPES: Record<Shape, string> = {
  rounded: "rounded-md",
  circle: "rounded-full",
};

/**
 * Tonal overlay applied when `pressed` is true. Mirrors the active state
 * used in the segmented control / chip primitives so a toggle IconButton
 * reads consistent with its labeled siblings.
 */
const PRESSED: Record<Variant, string> = {
  ghost: "bg-white/10 text-white",
  danger: "bg-rose-500/20 text-rose-100",
  warning: "bg-amber-400/20 text-amber-100",
  subtle: "bg-surface-700 text-fg-primary",
  bordered: "border-accent-400/60 bg-accent-500/15 text-accent-200",
};

export function IconButton({
  icon,
  variant = "ghost",
  size = "md",
  shape = "rounded",
  pressed,
  className = "",
  disabled,
  ref,
  ...rest
}: Props) {
  const cls = [
    BASE,
    SIZES[size],
    SHAPES[shape],
    pressed ? PRESSED[variant] : VARIANTS[variant],
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      aria-pressed={pressed}
      className={cls}
      {...rest}
    >
      {icon}
    </button>
  );
}
