import type { ReactNode } from "react";
import { Eyebrow, type EyebrowTone } from "../ui/Label";
import { Surface } from "../ui/Surface";

// The flat admin tab panel: tinted Surface with an eyebrow + one-line summary
// header and an always-open darker working area. Successor to the old
// ExpandableAdminCard — with the admin page tabbed, every section IS its
// tab's whole content, so the Manage/Close chrome and collapsed state went
// away; the shell keeps the same tone ring + working-area treatment so the
// panels read unchanged.

type Tone = Extract<EyebrowTone, "amber" | "accent">;

const TONE_RING: Record<Tone, string> = {
  amber: "ring-1 ring-inset ring-amber-500/20",
  accent: "ring-1 ring-inset ring-accent-500/20",
};

type AdminSectionProps = {
  tone: Tone;
  eyebrow: ReactNode;
  /** One-line status under the eyebrow (count, hint, "Loading…"). */
  summary: ReactNode;
  /** Working area. Pass null while not ready — the area (and its border)
   *  only renders when there is something to show. */
  children?: ReactNode;
};

export function AdminSection({ tone, eyebrow, summary, children }: AdminSectionProps) {
  return (
    <Surface
      as="section"
      variant="panel"
      padding="none"
      className={`overflow-hidden ${TONE_RING[tone]}`}
    >
      <div className="min-w-0 px-4 py-3">
        <Eyebrow tone={tone}>{eyebrow}</Eyebrow>
        <p className="mt-1 text-sm text-fg-secondary">{summary}</p>
      </div>
      {children != null && (
        <div className="space-y-3 border-t border-white/5 bg-surface-950/40 px-4 py-4">
          {children}
        </div>
      )}
    </Surface>
  );
}
