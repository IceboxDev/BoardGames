import type { ReactNode } from "react";
import { ArrowRightIcon, ChevronDownIcon } from "../icons";

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
      <h3 className="text-lg font-semibold text-gray-200 transition-colors group-hover:text-white">
        {title}
      </h3>
      {affordance === "arrow" && (
        <ArrowRightIcon className="h-4 w-4 shrink-0 text-gray-600 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-[var(--accent)]" />
      )}
      {affordance && typeof affordance === "object" && affordance.kind === "chevron" && (
        <ChevronDownIcon
          className={`h-4 w-4 shrink-0 text-gray-500 transition-transform duration-200 group-hover:text-[var(--accent)] ${
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
  return <p className="text-xs uppercase tracking-[0.18em] text-gray-500">{children}</p>;
}

/**
 * Body-text description with deterministic line-clamp. `lines` defaults to
 * 6 (the value all current consumers use); pass a different value if a
 * future card layout needs a tighter or looser ceiling.
 */
export function GameCardDescription({
  children,
  lines = 6,
}: {
  children: ReactNode;
  lines?: number;
}) {
  // line-clamp-* values must be static for Tailwind to emit the rule; map
  // common values to their literal class names instead of interpolating.
  const clampCls =
    lines === 4
      ? "line-clamp-4"
      : lines === 5
        ? "line-clamp-5"
        : lines === 7
          ? "line-clamp-7"
          : "line-clamp-6";
  return <p className={`${clampCls} flex-1 text-sm leading-relaxed text-gray-400`}>{children}</p>;
}
