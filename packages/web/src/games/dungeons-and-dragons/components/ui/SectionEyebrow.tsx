import type { ElementType, ReactNode } from "react";

// ── SectionEyebrow ───────────────────────────────────────────────────────
//
// The tool's section kicker: "Rulebooks", "The party", "Further danger". The
// chain `text-3xs font-bold uppercase tracking-eyebrow text-amber-300/70` was
// hand-written ~12 times across 8 files, each picking its own amber opacity.
//
// Why not the global `<Eyebrow>`: that one is `text-2xs font-semibold` in a
// solid tone, tuned for the app shell's modal headers. This one is smaller,
// bolder, and translucent — it sits on parchment, not on a dark panel. Forcing
// them together would mean overriding font-size and weight at every call site,
// and two `text-*` classes in one string let Tailwind's ordering, not the
// caller, pick the winner.

type SectionEyebrowProps = {
  as?: ElementType;
  tone?: "amber" | "rose";
  /** Dimmer variant for secondary rails (the Sources screen's group labels). */
  dim?: boolean;
  className?: string;
  children: ReactNode;
};

export function SectionEyebrow({
  as: Tag = "p",
  tone = "amber",
  dim = false,
  className = "",
  children,
}: SectionEyebrowProps) {
  const color =
    tone === "rose"
      ? dim
        ? "text-rose-300/50"
        : "text-rose-300/70"
      : dim
        ? "text-amber-300/50"
        : "text-amber-300/70";
  return (
    <Tag
      className={`font-serif-body text-3xs font-bold uppercase tracking-eyebrow ${color} ${className}`}
    >
      {children}
    </Tag>
  );
}
