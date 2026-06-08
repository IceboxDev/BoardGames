import type { ReactNode } from "react";

// The single empty-state primitive. Replaces the dozen hand-rolled
// dashed-border "Nothing here yet" / "No matches" / "Guest list is locked"
// blocks with one component: optional icon bubble, title, description, and a
// CTA slot.
//
// Tones:
//   neutral (default) — dashed white border, no fill. Standard "no data yet".
//   amber / rose      — tinted border + filled icon bubble, for advisory
//                       states (locked guest list, "you're sitting this out").
//
// `fill` centers the block in the available height (for full-area empties);
// otherwise the block is a full-width banner inside its container.

type EmptyStateTone = "neutral" | "amber" | "rose";

type EmptyStateProps = {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** CTA element (e.g. a Button). Rendered centered below the description. */
  action?: ReactNode;
  tone?: EmptyStateTone;
  fill?: boolean;
  className?: string;
};

const TONE: Record<EmptyStateTone, { border: string; bubble: string; title: string }> = {
  neutral: {
    border: "border-dashed border-white/10",
    bubble: "bg-surface-800 text-fg-secondary",
    title: "text-fg-secondary",
  },
  amber: {
    border: "border-amber-300/30 bg-amber-400/[0.06]",
    bubble: "bg-amber-400/20 text-amber-200",
    title: "text-amber-100",
  },
  rose: {
    border: "border-rose-400/25 bg-rose-500/[0.06]",
    bubble: "bg-rose-500/20 text-rose-200",
    title: "text-rose-100",
  },
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  tone = "neutral",
  fill = false,
  className = "",
}: EmptyStateProps) {
  const t = TONE[tone];
  const box = (
    <div className={`rounded-2xl border px-8 py-10 text-center ${t.border}`}>
      {icon && (
        <div
          className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full ${t.bubble}`}
        >
          {icon}
        </div>
      )}
      <p className={`text-sm font-medium ${t.title}`}>{title}</p>
      {description && <p className="mt-1 text-xs leading-relaxed text-fg-muted">{description}</p>}
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );

  if (fill) {
    return (
      <div className={`flex min-h-0 flex-1 items-center justify-center ${className}`}>
        <div className="w-full max-w-md">{box}</div>
      </div>
    );
  }
  return <div className={className}>{box}</div>;
}
