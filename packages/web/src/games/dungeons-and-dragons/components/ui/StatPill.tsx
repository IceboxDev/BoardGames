import type { ReactNode } from "react";

// ── StatPill ─────────────────────────────────────────────────────────────
//
// A numeric combat stat as a rounded chip: "14 HP", "AC 15", "×3". The HP and
// AC chips existed 9 and 4 times respectively, drifting between `px-1.5`/`px-2`
// and `ring-…/30`/`ring-…/40`.
//
// Deliberately NOT the global `Badge`: that primitive is a *label* pill — it
// forces `uppercase` and the wide `tracking-pill`, which is right for "HOST"
// and wrong for "AC 15" (letter-spaced digits read as separate numbers). Word
// pills in this tool — an NPC's kind, a file's type, "Granted"/"Spent" — DO use
// `Badge`. Numbers use this.

export type StatPillTone = "hp" | "ac" | "count" | "condition";

const TONES: Record<StatPillTone, string> = {
  hp: "bg-rose-500/15 text-rose-200 ring-rose-400/30",
  ac: "bg-sky-500/15 text-sky-200 ring-sky-400/30",
  count: "bg-amber-400/15 text-amber-200 ring-amber-400/30",
  condition: "bg-purple-500/15 text-purple-200 ring-purple-400/30",
};

type StatPillProps = {
  tone: StatPillTone;
  children: ReactNode;
  className?: string;
};

export function StatPill({ tone, children, className = "" }: StatPillProps) {
  return (
    <span
      className={`shrink-0 rounded-full px-1.5 py-0.5 text-3xs font-bold tabular-nums ring-1 ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
