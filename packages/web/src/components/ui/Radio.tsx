import type { InputHTMLAttributes, ReactNode, Ref } from "react";

// ── Radio ────────────────────────────────────────────────────────────────
//
// The single radio primitive — the round sibling of `Checkbox`. A native
// `<input type="radio">` carrying the accent + focus-ring tokens; group radios
// by sharing a `name`. Pass `label` for an aligned clickable row, or omit it for
// the bare control.

type RadioProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label?: ReactNode;
  ref?: Ref<HTMLInputElement>;
};

export function Radio({ label, className = "", id, ref, ...rest }: RadioProps) {
  const dot = (
    <input
      ref={ref}
      type="radio"
      id={id}
      className={`h-4 w-4 shrink-0 border border-white/15 bg-surface-900 accent-accent-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400/40 disabled:opacity-50 ${className}`}
      {...rest}
    />
  );
  if (!label) return dot;
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm text-fg-secondary">
      {dot}
      <span>{label}</span>
    </label>
  );
}
