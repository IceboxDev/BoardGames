import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "../../lib/cn";
import type { CoreTone } from "./tones";

// Icon-only button primitive. Requires an `aria-label` at the type level
// (screen readers see no visible text) and enforces square padding so the
// icon stays centered.
//
// Like `Button`, two orthogonal axes describe it:
//   variant — the *structure*: `ghost` (hover-fill only), `subtle` (neutral
//             hover bg for rows that have their own hover treatment),
//             `bordered` (standalone chrome for floating action buttons).
//   tone    — the *color* (shared `CoreTone` vocabulary + `neutral`). The old
//             `variant="danger"` / `variant="warning"` spellings are now
//             `tone="rose"` / `tone="amber"` — same words as every other
//             primitive.
//
// Use `IconButton` for: edit / delete row actions, expand toggles, admin /
// lock-in chrome buttons, +/- steppers in setup screens, and dialog close-X
// chrome (Modal and Drawer both use it, so the focus ring is guaranteed).

type Variant = "ghost" | "subtle" | "bordered";
type IconTone = CoreTone | "neutral";
type Size = "xs" | "sm" | "md" | "lg";
type Shape = "rounded" | "pill";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  /** Icon to render — typically one of the components in `components/icons`. */
  icon: ReactNode;
  /** Required: the only label a screen reader will see. */
  "aria-label": string;
  variant?: Variant;
  /** Color role. Only tints `ghost`; `subtle`/`bordered` are neutral chrome. */
  tone?: IconTone;
  size?: Size;
  shape?: Shape;
  /** Optional visual `aria-pressed` highlight for toggle-style icon buttons. */
  pressed?: boolean;
  ref?: Ref<HTMLButtonElement>;
};

const BASE =
  "inline-flex shrink-0 items-center justify-center transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400/60 disabled:cursor-not-allowed disabled:opacity-40";

// Ghost text + hover treatment per tone. Full literals — Tailwind cannot see
// runtime-assembled class names.
const GHOST_TONE: Record<IconTone, string> = {
  neutral: "text-fg-secondary hover:bg-white/5 hover:text-white",
  accent: "text-accent-300 hover:bg-accent-500/10 hover:text-accent-200",
  amber: "text-amber-300 hover:bg-amber-400/10 hover:text-amber-100",
  sky: "text-sky-300 hover:bg-sky-400/10 hover:text-sky-100",
  emerald: "text-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-200",
  rose: "text-rose-400 hover:bg-rose-500/10 hover:text-rose-200",
};

const STRUCTURAL: Record<Exclude<Variant, "ghost">, string> = {
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
  pill: "rounded-full",
};

// Tonal overlay applied when `pressed` is true. Mirrors the active state
// used in the segmented control / chip primitives so a toggle IconButton
// reads consistent with its labeled siblings.
const GHOST_PRESSED: Record<IconTone, string> = {
  neutral: "bg-white/10 text-white",
  accent: "bg-accent-500/20 text-accent-100",
  amber: "bg-amber-400/20 text-amber-100",
  sky: "bg-sky-400/20 text-sky-100",
  emerald: "bg-emerald-500/20 text-emerald-100",
  rose: "bg-rose-500/20 text-rose-100",
};

const STRUCTURAL_PRESSED: Record<Exclude<Variant, "ghost">, string> = {
  subtle: "bg-surface-700 text-fg-primary",
  bordered: "border-accent-400/60 bg-accent-500/15 text-accent-200",
};

export function IconButton({
  icon,
  variant = "ghost",
  tone = "neutral",
  size = "md",
  shape = "rounded",
  pressed,
  className,
  disabled,
  ref,
  ...rest
}: Props) {
  const skin =
    variant === "ghost"
      ? pressed
        ? GHOST_PRESSED[tone]
        : GHOST_TONE[tone]
      : pressed
        ? STRUCTURAL_PRESSED[variant]
        : STRUCTURAL[variant];
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      aria-pressed={pressed}
      className={cn(BASE, SIZES[size], SHAPES[shape], skin, className)}
      {...rest}
    >
      {icon}
    </button>
  );
}
