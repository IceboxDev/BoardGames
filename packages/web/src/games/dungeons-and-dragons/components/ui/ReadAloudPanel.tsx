import type { ReactNode } from "react";
import { DndPanel } from "./DndPanel";

// ── ReadAloudPanel ───────────────────────────────────────────────────────
//
// The boxed prose the DM reads to the table: a tracked eyebrow, an optional
// action on the same line (the "Log" button), and the narration in the body
// serif. There were five copies — two of them consecutive and identical inside
// StoryTree — and they had drifted on text opacity (/90 vs /95) and the gap
// under the eyebrow (mt-2 vs mt-1.5).
//
// `surface="inset"` is the flatter box used when the panel already sits inside
// another panel (the combat dashboard). `tone="rose"` is the referee's
// objection card, which is the same layout carrying the opposite meaning.

type ReadAloudPanelProps = {
  /** Defaults to "Read aloud". */
  eyebrow?: ReactNode;
  /** Right-aligned control on the eyebrow row (e.g. the Log button). */
  action?: ReactNode;
  tone?: "amber" | "rose";
  /** `panel` is a standalone card; `inset` sits inside another panel. */
  surface?: "panel" | "inset";
  children: ReactNode;
};

const EYEBROW_TONE = {
  amber: "text-amber-300/70",
  rose: "text-rose-300",
} as const;

export function ReadAloudPanel({
  eyebrow = "Read aloud",
  action,
  tone = "amber",
  surface = "panel",
  children,
}: ReadAloudPanelProps) {
  const header = (
    <div className="flex items-center justify-between gap-2">
      <p
        className={`font-serif-body text-3xs font-bold uppercase tracking-eyebrow ${EYEBROW_TONE[tone]}`}
      >
        {eyebrow}
      </p>
      {action}
    </div>
  );

  const body = (
    <div className="font-serif-body mt-2 whitespace-pre-line text-base leading-relaxed text-amber-100/95">
      {children}
    </div>
  );

  if (surface === "inset") {
    return (
      <div
        className={`rounded-xl border px-4 py-3 ${
          tone === "rose" ? "border-rose-400/40 bg-rose-950/30" : "border-amber-400/30 bg-black/30"
        }`}
      >
        {header}
        {body}
      </div>
    );
  }

  return (
    <DndPanel tone={tone} padding="lg" className="shrink-0">
      {header}
      {body}
    </DndPanel>
  );
}
