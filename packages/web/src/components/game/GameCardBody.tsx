import type { ReactNode } from "react";
import type { GameDescriptions } from "../../games/types";
import { ArrowRightIcon, ChevronDownIcon } from "../icons";
import {
  DESCRIPTION_LINE_HEIGHT,
  DESCRIPTION_TARGET_PX,
  useDescriptionFont,
} from "./description-font";

// Body block for catalog-style game cards. Owns the standard padding,
// flex/gap layout, and a header row with a title + optional trailing
// affordance (arrow for navigable cards, chevron for expand/collapse).
//
// Everything below the header is freeform `children` so each consumer can
// add the bits it wants: a kicker line (family + variant), a summary
// (year · players · time), a description block, a complexity footer.

type Affordance = "arrow" | { kind: "chevron"; expanded: boolean } | null;

type GameCardBodyProps = {
  title: string;
  /**
   * Trailing affordance in the header row.
   *   - "arrow"          → navigable to /play/<slug>
   *   - { chevron, expanded } → FamilyCard toggle
   *   - null (default)   → nothing
   */
  affordance?: Affordance;
  children?: ReactNode;
};

export function GameCardBody({ title, affordance = null, children }: GameCardBodyProps) {
  return (
    <div className="relative flex flex-1 flex-col gap-2 px-6 py-5">
      <GameCardHeader title={title} affordance={affordance} />
      {children}
    </div>
  );
}

function GameCardHeader({ title, affordance }: { title: string; affordance: Affordance }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <h3 className="text-lg font-semibold text-fg-primary transition-colors group-hover:text-white">
        {title}
      </h3>
      {affordance === "arrow" && (
        <ArrowRightIcon className="h-4 w-4 shrink-0 text-fg-disabled transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-[var(--accent)]" />
      )}
      {affordance && typeof affordance === "object" && affordance.kind === "chevron" && (
        <ChevronDownIcon
          className={`h-4 w-4 shrink-0 text-fg-muted transition-transform duration-200 group-hover:text-[var(--accent)] ${
            affordance.expanded ? "rotate-180" : ""
          }`}
        />
      )}
    </div>
  );
}

/**
 * Uppercase tracking-wider meta line under the title — used for the
 * "{year} · {players} · {time}" summary or "{family} · {variant}" kicker.
 * Lives here so all three card variants render meta lines at exactly the
 * same size and weight.
 */
export function GameCardMeta({ children }: { children: ReactNode }) {
  return <p className="truncate text-2xs uppercase tracking-[0.18em] text-fg-muted">{children}</p>;
}

/**
 * Body-text description for catalog cards. Renders the `default` variant at
 * the uniform font chosen by the enclosing {@link DescriptionGrid} — the
 * largest size at which the longest description in the grid still fits, so
 * every card matches and nothing is truncated (the font scales down on
 * smaller screens instead). The baseline `min-height` keeps cards uniform
 * for shorter blurbs and lets an over-long outlier grow rather than clip.
 */
export function GameCardDescription({ descriptions }: { descriptions: GameDescriptions }) {
  const fontPx = useDescriptionFont();
  const text = descriptions.default || descriptions.tight || descriptions.loose;
  if (!text) return null;
  return (
    <p
      className="shrink-0 text-fg-secondary"
      style={{
        minHeight: DESCRIPTION_TARGET_PX,
        fontSize: `${fontPx}px`,
        lineHeight: DESCRIPTION_LINE_HEIGHT,
      }}
    >
      {text}
    </p>
  );
}
