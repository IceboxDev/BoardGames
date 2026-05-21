import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";

// Shared chrome for catalog-style game cards in `GameCard`, `OnlineFamilyCard`,
// and `FamilyCard`. Owns the rounded-2xl border, the surface-900 background,
// the accent-aware hover treatment, and the staggered fade-in entry animation
// driven by `index` (each card delays its entry by index * 80ms).
//
// The clickable surface is configurable so the same chrome handles the three
// real-world cases:
//   - Link  → most catalog entries route to /play/<slug>
//   - Button → FamilyCard's expand/collapse toggle
//   - Div    → catalog-only games without a playable component
//
// `overlay` renders outside the clickable surface so consumers can stack an
// absolutely-positioned widget on top (OnlineFamilyCard's variant rim strip,
// straddling the left thumbnail border) without breaking the link/button's
// click target.

type ClickableAs =
  | { kind: "link"; to: string }
  | {
      kind: "button";
      onClick: () => void;
      ariaExpanded?: boolean;
      ariaLabel?: string;
    }
  | { kind: "div" };

type Props = {
  /** Per-card accent color, exposed as the `--accent` CSS variable to children. */
  accentHex: string;
  /** Stagger index for entry animation; multiplied by 80ms. */
  index?: number;
  /** What the clickable surface should be. */
  as: ClickableAs;
  /** Card body (typically `<GameCardThumb>` + the body content). */
  children: ReactNode;
  /**
   * Absolutely-positioned overlay rendered OUTSIDE the clickable surface so
   * a child widget (variant rim strip) can sit above the thumbnail without
   * breaking the card's click target.
   */
  overlay?: ReactNode;
};

const CHROME_BASE =
  "group relative flex flex-col overflow-hidden rounded-2xl border bg-surface-900 transition-all duration-300";

/**
 * Hover color treatment used by the three catalog card variants. The
 * accent-tinted background overlay uses `color-mix` so the same accent hex
 * drives both border and background subtly differently.
 */
const HOVER_BASE =
  "hover:border-[var(--accent)]/40 hover:bg-[color-mix(in_srgb,var(--accent)_8%,var(--color-surface-900))]";

const BORDER_BASE = "border-white/[0.08]";

export function GameCardChrome({ accentHex, index = 0, as, children, overlay }: Props) {
  const style: CSSProperties = {
    "--accent": accentHex,
    animationDelay: `${index * 80}ms`,
  } as CSSProperties;

  const cardCls = `${CHROME_BASE} ${BORDER_BASE} ${HOVER_BASE} animate-card-fade-up text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]`;

  // No overlay → render the clickable surface as the outer element so the
  // animation delay + accent CSS variable live on the only DOM node.
  if (!overlay) {
    return renderClickable(as, cardCls, style, children);
  }

  // With overlay → wrap in a positioned container that holds the animation
  // and accent variable, and render the clickable surface as a sibling of
  // the overlay so the overlay doesn't sit inside the link/button.
  return (
    <div className="relative animate-card-fade-up" style={style}>
      {renderClickable(as, cardCls.replace(" animate-card-fade-up", ""), undefined, children)}
      {overlay}
    </div>
  );
}

function renderClickable(
  as: ClickableAs,
  className: string,
  style: CSSProperties | undefined,
  children: ReactNode,
) {
  if (as.kind === "link") {
    return (
      <Link to={as.to} className={className} style={style}>
        {children}
      </Link>
    );
  }
  if (as.kind === "button") {
    return (
      <button
        type="button"
        onClick={as.onClick}
        aria-expanded={as.ariaExpanded}
        aria-label={as.ariaLabel}
        className={className}
        style={style}
      >
        {children}
      </button>
    );
  }
  return (
    <div className={className} style={style}>
      {children}
    </div>
  );
}
