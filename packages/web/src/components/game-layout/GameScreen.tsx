import type { ReactNode } from "react";
import { DEBUG_LAYOUT } from "../../lib/debug";

interface GameScreenProps {
  /** Background class applied to the root container (e.g. "bg-black"). */
  background?: string;
  /** Extra classes on the content area (e.g. "mx-auto max-w-2xl"). Gap and padding are built-in. */
  contentClassName?: string;
  /** History log content (right side). GameScreen provides the sidebar chrome. */
  sidebar?: ReactNode;
  /** Left-side panel content (score, status, approach track, …). Always visible
   *  (part of the board) and only spans the board height, not the fan row. */
  leftSidebar?: ReactNode;
  /** Heading shown above the left sidebar (e.g. "Score", "Approach"). */
  leftSidebarTitle?: string;
  /** Card hand component (CardFan, PlayerHand, etc.). Pinned to bottom of content area. */
  fan?: ReactNode;
  /** Controls above the card fan (Confirm button, Pass/Take, status, etc.). */
  fanActions?: ReactNode;
  /** Main game board content. */
  children: ReactNode;
  /** Skip content-area padding and flex-col (for edge-to-edge canvas games). */
  noPadding?: boolean;
  /**
   * Opt-in phone mode: below `lg` both sidebars are hidden and the content
   * padding tightens. A game that opts in MUST re-surface the sidebar
   * content (score, chat, history) inside its board for small screens —
   * GameScreen only frees the width. Games that don't pass this render
   * exactly as before on every viewport.
   */
  collapsibleSidebars?: boolean;
}

export default function GameScreen({
  background,
  contentClassName,
  sidebar,
  leftSidebar,
  leftSidebarTitle,
  fan,
  fanActions,
  children,
  noPadding,
  collapsibleSidebars,
}: GameScreenProps) {
  const asideVisibility = collapsibleSidebars ? "hidden lg:flex" : "flex";
  const rowPad = collapsibleSidebars ? "px-1 sm:px-4" : "px-4";
  // Phone boards are taller than the viewport — the content column must
  // scroll (desktop boards are built to fit, so the default stays visible).
  const contentPad = collapsibleSidebars
    ? "overflow-y-auto px-2 pt-3 sm:px-4 sm:pt-4"
    : "px-4 pt-4";
  return (
    // `relative z-10` is load-bearing: `GameShellLayoutInner` renders a fixed
    // `def.backgroundImage` at `z-0` over the entire main area. Without a
    // positioning context here, GameScreen's static descendants (sidebars,
    // fan tray, History) paint at CSS-painting step 3 and the bg image at
    // step 6 — i.e. the image covers them. Promoting GameScreen to
    // `relative z-10` puts its whole subtree above the image's stacking
    // context so the `bg-surface-950` actually covers the image and the
    // sidebars / history / fan become visible.
    <div className={`relative z-10 flex min-h-0 flex-1${background ? ` ${background}` : ""}`}>
      {/* PC-first layout: the left panel + board sit on top; the fan / controls
          span the full width underneath (from the screen edge to the History
          sidebar). History itself spans the complete height on the right and
          is always visible. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className={`flex min-h-0 flex-1 ${rowPad}`}>
          {leftSidebar && (
            <aside
              className={`${asideVisibility} w-64 shrink-0 flex-col overflow-y-auto bg-surface-900/60 p-4${DEBUG_LAYOUT ? " border-2 border-fuchsia-400 bg-fuchsia-400/10" : ""}`}
            >
              {leftSidebarTitle && (
                <h3 className="mb-3 shrink-0 text-xs font-bold uppercase tracking-wider text-fg-muted">
                  {leftSidebarTitle}
                </h3>
              )}
              {leftSidebar}
            </aside>
          )}
          {noPadding ? (
            <div className="min-h-0 min-w-0 flex-1">{children}</div>
          ) : (
            <div
              className={`flex min-h-0 min-w-0 flex-1 flex-col gap-2 ${contentPad}${contentClassName ? ` ${contentClassName}` : ""}`}
            >
              {children}
            </div>
          )}
        </div>
        {fan != null && (
          <div className="flex shrink-0 flex-col gap-2 px-4 pb-4 pt-2">
            {/* min-h (not h) — reserves one button-row of height so the board
                doesn't jump when actions appear/disappear, but never clips a
                taller control a game passes in. */}
            <div
              className={`flex min-h-9 items-center justify-center${DEBUG_LAYOUT ? " border-2 border-yellow-400 bg-yellow-400/10" : ""}`}
            >
              {fanActions}
            </div>
            <div className={DEBUG_LAYOUT ? "border-2 border-pink-400 bg-pink-400/10" : ""}>
              {fan}
            </div>
          </div>
        )}
      </div>
      {sidebar && (
        <aside
          className={`my-2 mr-2 ${asideVisibility} w-72 shrink-0 flex-col overflow-y-auto rounded-xl bg-surface-900/60 p-4${DEBUG_LAYOUT ? " border-2 border-cyan-400 bg-cyan-400/10" : ""}`}
        >
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-fg-muted">History</h3>
          {sidebar}
        </aside>
      )}
    </div>
  );
}
