import type { InputHTMLAttributes, Ref } from "react";

// Width presets so call sites stop reaching for ad-hoc width + alignment
// overrides on a numeric field:
//   full  (default) — block input, fills its container.
//   auto            — intrinsic width (let the parent flex/grid size it).
//   score           — narrow, right-aligned numeric field (match-history score
//                     inputs). Carries `text-right tabular-nums` so digits line
//                     up without a per-call-site override.
type InputWidth = "full" | "auto" | "score";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
  width?: InputWidth;
  ref?: Ref<HTMLInputElement>;
};

const WIDTHS: Record<InputWidth, string> = {
  full: "w-full",
  auto: "",
  score: "w-24 text-right tabular-nums",
};

export function Input({ invalid = false, width = "full", className = "", ref, ...rest }: Props) {
  return (
    <input
      ref={ref}
      className={`${WIDTHS[width]} rounded-lg border bg-surface-900 px-3 py-2 text-sm text-fg-primary placeholder:text-fg-muted focus:outline-none focus:ring-2 ${
        invalid
          ? "border-rose-500/50 focus:ring-rose-500/40"
          : "border-white/10 focus:border-accent-400/60 focus:ring-accent-400/30"
      } ${className}`}
      {...rest}
    />
  );
}
