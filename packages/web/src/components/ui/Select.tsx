import type { Ref, SelectHTMLAttributes } from "react";

// `<select>` sibling of `Input` — same surface-token chrome, focus ring, and
// `invalid` state. Use instead of hand-styling `<select className="rounded-md
// border border-white/10 bg-surface-900 …">` at every form site.
//
//   block   stretch to fill the parent (default). Set false for inline,
//           auto-width selects (e.g. the match-history storyteller picker).
//   compact tighter padding + text-xs for dense form rows.

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  invalid?: boolean;
  block?: boolean;
  compact?: boolean;
  ref?: Ref<HTMLSelectElement>;
};

export function Select({
  invalid = false,
  block = true,
  compact = false,
  className = "",
  ref,
  children,
  ...rest
}: Props) {
  const sizing = compact ? "rounded-md px-2 py-1 text-xs" : "rounded-lg px-3 py-2 text-sm";
  const cls = [
    "border bg-surface-900 text-fg-primary focus:outline-none focus:ring-2",
    block ? "w-full" : "",
    sizing,
    invalid
      ? "border-rose-500/50 focus:ring-rose-500/40"
      : "border-white/10 focus:border-accent-400/60 focus:ring-accent-400/30",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <select ref={ref} className={cls} {...rest}>
      {children}
    </select>
  );
}
