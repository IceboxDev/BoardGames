import type { InputHTMLAttributes, ReactNode, Ref } from "react";

// ── Checkbox ───────────────────────────────────────────────────────────────
//
// The single checkbox primitive. A native `<input type="checkbox">` styled with
// the app's accent + focus-ring tokens (via the `accent-*` CSS property, so the
// browser draws the check and we keep full a11y/keyboard behaviour for free).
// Pass `label` to get an aligned clickable row; omit it to place the bare box.
// Matches `Input`'s border/focus idiom so checkboxes and text fields read as one
// family.

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label?: ReactNode;
  ref?: Ref<HTMLInputElement>;
};

export function Checkbox({ label, className = "", id, ref, ...rest }: CheckboxProps) {
  const box = (
    <input
      ref={ref}
      type="checkbox"
      id={id}
      className={`h-4 w-4 shrink-0 rounded border border-white/15 bg-surface-900 accent-accent-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400/40 disabled:opacity-50 ${className}`}
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
