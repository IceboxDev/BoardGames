import type { ReactNode } from "react";
import { Chip, type ChipTone } from "../ui/Chip";
import { Eyebrow, type EyebrowTone } from "../ui/Label";
import { Surface } from "../ui/Surface";

// The expandable admin dashboard card: tinted panel, eyebrow + one-line
// summary, and a Manage/Close chip that reveals a darker working area.
// GuestPlayersCard and PreRegisterCard used to each hand-roll this shell —
// identical four-part skeleton, drifting only on the tone and on the
// hand-typed eyebrow (both had wandered off the `Eyebrow` primitive).
// Chrome comes from `Surface`; the tone rides an inset ring so it never
// fights the panel variant's own border.

type Tone = Extract<ChipTone & EyebrowTone, "amber" | "accent">;

const TONE_RING: Record<Tone, string> = {
  amber: "ring-1 ring-inset ring-amber-500/20",
  accent: "ring-1 ring-inset ring-accent-500/20",
};

type ExpandableAdminCardProps = {
  tone: Tone;
  eyebrow: ReactNode;
  /** One-line status under the eyebrow (count, hint, "Loading…"). */
  summary: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  /** Disable the Manage chip (e.g. while the card's data is loading). */
  toggleDisabled?: boolean;
  /** Expanded working area. Pass null while not ready — the area (and its
   *  border) only renders when there is something to show. */
  children?: ReactNode;
};

export function ExpandableAdminCard({
  tone,
  eyebrow,
  summary,
  expanded,
  onToggle,
  toggleDisabled = false,
  children,
}: ExpandableAdminCardProps) {
  return (
    <Surface
      as="section"
      variant="panel"
      padding="none"
      className={`mb-6 overflow-hidden ${TONE_RING[tone]}`}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <Eyebrow tone={tone}>{eyebrow}</Eyebrow>
          <p className="mt-1 text-sm text-fg-secondary">{summary}</p>
        </div>
        <Chip
          pressed={expanded}
          tone={tone}
          size="xs"
          disabled={toggleDisabled}
          onClick={onToggle}
          className="shrink-0"
        >
          {expanded ? "Close" : "Manage"}
        </Chip>
      </div>
      {expanded && children != null && (
        <div className="space-y-3 border-t border-white/5 bg-surface-950/40 px-4 py-4">
          {children}
        </div>
      )}
    </Surface>
  );
}
