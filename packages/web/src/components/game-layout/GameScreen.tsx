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
}: GameScreenProps) {
  return (
    <div className={`flex min-h-0 flex-1${background ? ` ${background}` : ""}`}>
      {/* Everything to the left of the History sidebar: the left panel + board
          sit on top; the fan / controls span the full width underneath (from
          the screen edge to the History sidebar). History itself spans the
          complete height on the right. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1">
          {leftSidebar && (
            // Part of the board, not a floating aside: full-bleed (no rounded
            // corners / margins), fills the board's vertical space, and stops
            // above the fan row rather than running to the very bottom.
            <aside
              className={`flex w-36 shrink-0 flex-col overflow-y-auto bg-gray-900/60 p-2 sm:w-48 sm:p-3 lg:w-64 lg:p-4${DEBUG_LAYOUT ? " border-2 border-fuchsia-400 bg-fuchsia-400/10" : ""}`}
            >
              {leftSidebarTitle && (
                <h3 className="mb-2 shrink-0 text-xs font-bold uppercase tracking-wider text-gray-500 lg:mb-3">
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
              className={`flex min-h-0 min-w-0 flex-1 flex-col gap-2 px-2 pt-2 sm:px-4 sm:pt-4${contentClassName ? ` ${contentClassName}` : ""}`}
            >
              {children}
            </div>
          )}
        </div>
        {fan != null && (
          <div className="flex shrink-0 flex-col gap-2 px-2 pb-2 pt-2 sm:px-4 sm:pb-4">
            <div
              className={`flex h-9 items-center justify-center${DEBUG_LAYOUT ? " border-2 border-yellow-400 bg-yellow-400/10" : ""}`}
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
          className={`my-2 mr-2 hidden w-72 shrink-0 flex-col overflow-y-auto rounded-xl bg-gray-900/60 p-4 lg:flex${DEBUG_LAYOUT ? " border-2 border-cyan-400 bg-cyan-400/10" : ""}`}
        >
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">History</h3>
          {sidebar}
        </aside>
      )}
    </div>
  );
}
