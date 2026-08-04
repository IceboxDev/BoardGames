import type { Ref, SelectHTMLAttributes } from "react";
import { ChevronDownIcon } from "../icons";

// `<select>` sibling of `Input` — same surface-token chrome, focus ring, and
// `invalid` state. Use instead of hand-styling `<select className="rounded-md
// border border-white/10 bg-surface-900 …">` at every form site.
//
//   block   stretch to fill the parent (default). Set false for inline,
//           auto-width selects (e.g. the match-history storyteller picker).
//   compact tighter padding + text-xs for dense form rows.
//   chevron replace the native arrow with the app's ChevronDownIcon
//           (`appearance-none` + an absolutely-positioned icon). Use in
//           chrome-sensitive bars (filters) where the OS arrow clashes.
//   active  accent-tinted border + text for "a non-default value is chosen"
//           (filter bars highlight applied filters this way).

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  invalid?: boolean;
  block?: boolean;
  compact?: boolean;
  chevron?: boolean;
  active?: boolean;
  ref?: Ref<HTMLSelectElement>;
};

export function Select({
  invalid = false,
  block = true,
  compact = false,
  chevron = false,
  active = false,
  className = "",
  ref,
  children,
  ...rest
}: Props) {
  const sizing = compact ? "rounded-md px-2 py-1 text-xs" : "rounded-lg px-3 py-2 text-sm";
  const state = invalid
    ? "border-rose-500/50 focus:ring-rose-500/40"
    : active
      ? "border-accent-400/50 text-accent-100 focus:ring-accent-400/30"
      : "border-white/10 text-fg-primary focus:border-accent-400/60 focus:ring-accent-400/30";
  const cls = [
    "border bg-surface-900 focus:outline-none focus:ring-2",
    block ? "w-full" : "",
    sizing,
    chevron ? "appearance-none truncate pr-7" : "",
    state,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const select = (
    <select ref={ref} className={cls} {...rest}>
      {children}
    </select>
  );
  if (!chevron) return select;
  return (
    <span className={`relative ${block ? "block w-full" : "inline-block"}`}>
      {select}
      <ChevronDownIcon className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-muted" />
    </span>
  );
}
