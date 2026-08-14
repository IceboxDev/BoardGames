import type { InputHTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "../../lib/cn";

// ── Checkbox ───────────────────────────────────────────────────────────────
//
// The single checkbox primitive. A native `<input type="checkbox">` styled with
// the app's accent + focus-ring tokens (via the `accent-*` CSS property, so the
// browser draws the check and we keep full a11y/keyboard behaviour for free).
// Pass `label` to get an aligned clickable row; omit it to place the bare box.
// Matches `Input`'s border/focus idiom so checkboxes and text fields read as one
// family.

type CheckboxTone = "accent" | "emerald";

const TONES: Record<CheckboxTone, string> = {
  accent: "accent-accent-500",
  emerald: "accent-emerald-500",
};

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label?: ReactNode;
  /** Check color. `emerald` for affirmative toggles (hosting at home). */
  tone?: CheckboxTone;
  ref?: Ref<HTMLInputElement>;
};

export function Checkbox({
  label,
  tone = "accent",
  className = "",
  id,
  ref,
  ...rest
}: CheckboxProps) {
  const box = (
    <input
      ref={ref}
      type="checkbox"
      id={id}
      className={cn(
        "h-4 w-4 shrink-0 rounded border border-white/15 bg-surface-900",
        TONES[tone],
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400/40 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...rest}
    />
  );
  if (!label) return box;
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm text-fg-secondary">
      {box}
      <span>{label}</span>
    </label>
  );
}
