import type { ReactNode } from "react";
import { RADIUS_CARD_XL } from "../../../../components/ui/radii";
import { cn } from "../../../../lib/cn";

// The companion's section card. One bordered panel per concern (a night
// step, the nomination ritual, a Grimoire list), tinted by what it is:
//   neutral — chrome (roster, travellers, swap seats)
//   night   — a night step or anything that happens with eyes closed
//   day     — the day tracker's panels
//   danger  — deaths, the Grimoire's secrets, win declarations for evil
//   gold    — dawn, victory for good, the bag
// Built on the card-radius hook so the personalization engine reshapes it
// with every other panel in the app.

export type PanelTone = "neutral" | "night" | "day" | "danger" | "gold";

const TONES: Record<PanelTone, string> = {
  neutral: "border-line bg-surface-900/70",
  night: "border-accent-400/25 bg-accent-500/10",
  day: "border-amber-300/25 bg-amber-950/25",
  danger: "border-rose-400/35 bg-rose-950/40",
  gold: "border-amber-300/40 bg-amber-400/10",
};

export function Panel({
  title,
  tone = "neutral",
  children,
  className,
}: {
  title?: ReactNode;
  tone?: PanelTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn(RADIUS_CARD_XL, "border p-3 sm:p-4", TONES[tone], className)}>
      {title && (
        <h3 className="mb-2 text-xs font-bold uppercase tracking-label text-fg-secondary">
          {title}
        </h3>
      )}
      {children}
    </section>
  );
}
