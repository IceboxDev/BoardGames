import type { ElementType, ReactNode } from "react";
import { cn } from "../../lib/cn";
import { TONE_BUBBLE } from "./tones";

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
// `fillHeight` centers the block in the available height (for full-area
// empties); otherwise the block is a full-width banner inside its container.
// (Named to match `PageMain fillHeight` — `fill` means "full-bleed surface"
// on Button, so the height-centering role gets the explicit name.)

export type EmptyStateTone = "neutral" | "amber" | "rose";

type EmptyStateProps = {
  icon?: ReactNode;
  title: ReactNode;
  /** Element for the title — pass "h2" when the empty state IS the screen
   *  (a full-page placeholder) so the document keeps a real heading. */
  titleAs?: ElementType;
  description?: ReactNode;
  /** CTA element (e.g. a Button). Rendered centered below the description. */
  action?: ReactNode;
  tone?: EmptyStateTone;
  fillHeight?: boolean;
  className?: string;
};

// Border + title are EmptyState-specific; the icon bubble is the shared
// per-tone bubble recipe from `tones.ts`.
const TONE: Record<EmptyStateTone, { border: string; bubble: string; title: string }> = {
  neutral: {
    border: "border-dashed border-white/10",
    bubble: "bg-surface-800 text-fg-secondary",
    title: "text-fg-secondary",
  },
  amber: {
    border: "border-amber-300/30 bg-amber-400/[0.06]",
    bubble: TONE_BUBBLE.amber,
    title: "text-amber-100",
  },
  rose: {
    border: "border-rose-400/25 bg-rose-500/[0.06]",
    bubble: TONE_BUBBLE.rose,
    title: "text-rose-100",
  },
};

export function EmptyState({
  icon,
  title,
  titleAs: TitleTag = "p",
  description,
  action,
  tone = "neutral",
  fillHeight = false,
  className,
}: EmptyStateProps) {
  const t = TONE[tone];
  const box = (
    <div className={cn("rounded-2xl border px-8 py-10 text-center", t.border)}>
      {icon && (
        <div
          className={cn(
            "mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full",
            t.bubble,
          )}
        >
          {icon}
        </div>
      )}
      <TitleTag className={cn("text-sm font-medium", t.title)}>{title}</TitleTag>
      {description && <p className="mt-1 text-xs leading-relaxed text-fg-muted">{description}</p>}
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );

  if (fillHeight) {
    return (
      <div className={cn("flex min-h-0 flex-1 items-center justify-center", className)}>
        <div className="w-full max-w-md">{box}</div>
      </div>
    );
  }
  return <div className={className}>{box}</div>;
}
