import { type ReactNode, useEffect, useState } from "react";
import { useMediaQuery, WIDE_BOARD_QUERY } from "../../hooks/useMediaQuery";
import { cn } from "../../lib/cn";
import { DEBUG_LAYOUT } from "../../lib/debug";
import { Button } from "../ui/Button";
import { Drawer } from "../ui/Drawer";
import { Eyebrow } from "../ui/Label";

// ── GameScreen ───────────────────────────────────────────────────────────
//
// The one board layout. Every playable game renders this as its root and
// fills the slots; GameScreen owns all shared chrome — rails, padding, the
// fan tray, and what happens to the rails when the viewport can't fit them.
//
// PHONE-SAFE BY DEFAULT. Below `lg` (64rem) the two rails leave the board
// row entirely and re-surface in a bottom sheet behind a rail bar: the
// board gets the full width, and "Score" / "History" are one tap away. On a
// 360px phone the old always-visible rails spent 544px on chrome before the
// board got a pixel. A game does nothing to get this; the rails are mounted
// in exactly one place at a time (row OR sheet, decided by a media query in
// JS, never both), so stateful rail content is never double-mounted.
//
//   mobileRails="none"  — the game re-surfaces its rail content itself inside
//                         the board (Decrypto's MobilePanels) and wants no
//                         rail bar.
//   pinSidebars         — legacy escape hatch: keep both rails in the row at
//                         every width. No game uses it; it exists so a board
//                         whose rail IS the game (a status track that must
//                         stay visible) has a sanctioned way to say so.
//
// Rail widths are the `--layout-board-rail-w` / `--layout-history-rail-w`
// constants (index.css), consumed as `w-board-rail` / `w-history-rail`.

export type GameScreenMobileRails = "sheet" | "none";

interface GameScreenProps {
  /** Background class applied to the root container (e.g. "bg-black"). */
  background?: string;
  /** Extra classes on the content area (e.g. "mx-auto max-w-2xl"). Gap and padding are built-in. */
  contentClassName?: string;
  /** History log content (right rail). GameScreen provides the rail chrome. */
  sidebar?: ReactNode;
  /** Left rail content (score, status, approach track, …). Spans the board
   *  height, not the fan row. */
  leftSidebar?: ReactNode;
  /** Heading shown above the left rail on wide screens (e.g. "Score",
   *  "Approach"). Also names the rail's phone sheet unless `leftSidebarLabel`
   *  overrides it. */
  leftSidebarTitle?: string;
  /** Name for the left rail's phone button + sheet when the wide rail should
   *  carry no heading (a panel that draws its own). Defaults to
   *  `leftSidebarTitle`, then "Score". */
  leftSidebarLabel?: string;
  /** Card hand component (CardFan, PlayerHand, etc.). Pinned to bottom of content area. */
  fan?: ReactNode;
  /** Controls above the card fan (Confirm button, Pass/Take, status, etc.). */
  fanActions?: ReactNode;
  /** Main game board content. */
  children: ReactNode;
  /** Skip content-area padding and flex-col (for edge-to-edge canvas games). */
  noPadding?: boolean;
  /** What the rails become below `lg`. Default "sheet". */
  mobileRails?: GameScreenMobileRails;
  /** Legacy: keep both rails in the row at every viewport width. */
  pinSidebars?: boolean;
}

const HISTORY_LABEL = "History";
const DEFAULT_LEFT_LABEL = "Score";

type OpenRail = "left" | "right" | null;

export default function GameScreen({
  background,
  contentClassName,
  sidebar,
  leftSidebar,
  leftSidebarTitle,
  leftSidebarLabel,
  fan,
  fanActions,
  children,
  noPadding,
  mobileRails = "sheet",
  pinSidebars = false,
}: GameScreenProps) {
  const wide = useMediaQuery(WIDE_BOARD_QUERY);
  const railsInRow = pinSidebars || wide;
  const [openRail, setOpenRail] = useState<OpenRail>(null);

  // A sheet left open across a rotate/resize into the wide layout would sit
  // over a board that now shows the same rail in its row.
  useEffect(() => {
    if (railsInRow) setOpenRail(null);
  }, [railsInRow]);

  const leftLabel = leftSidebarLabel ?? leftSidebarTitle ?? DEFAULT_LEFT_LABEL;
  const hasRails = leftSidebar != null || sidebar != null;
  const showRailBar = !railsInRow && mobileRails === "sheet" && hasRails;

  return (
    // `relative z-raised` is load-bearing: `GameShellLayoutInner` renders a
    // fixed `def.backgroundImage` at `z-0` over the entire main area. Without
    // a positioning context here, GameScreen's static descendants (rails, fan
    // tray, History) paint at CSS-painting step 3 and the bg image at step 6
    // — i.e. the image covers them. Raising GameScreen puts its whole subtree
    // above the image's stacking context so the `bg-surface-950` actually
    // covers the image and the rails / history / fan become visible.
    <div className={cn("relative z-raised flex min-h-0 flex-1", background)}>
      {/* PC-first layout: the left rail + board sit on top; the fan / controls
          span the full width underneath (from the screen edge to the History
          rail). History itself spans the complete height on the right. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 px-1 sm:px-4">
          {railsInRow && leftSidebar && (
            <aside
              className={cn(
                "flex w-board-rail shrink-0 flex-col overflow-y-auto bg-surface-900/60 p-4",
                DEBUG_LAYOUT && "border-2 border-fuchsia-400 bg-fuchsia-400/10",
              )}
            >
              {leftSidebarTitle && (
                <Eyebrow as="h3" size="lg" tone="neutral" className="mb-3 shrink-0 font-bold">
                  {leftSidebarTitle}
                </Eyebrow>
              )}
              {leftSidebar}
            </aside>
          )}
          {noPadding ? (
            <div className="min-h-0 min-w-0 flex-1">{children}</div>
          ) : (
            // Phone boards are taller than the viewport, so the content column
            // scrolls below `lg`; desktop boards are built to fit and keep the
            // overflow visible so nothing inside them gets clipped.
            <div
              className={cn(
                "flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pt-3 sm:px-4 sm:pt-4 lg:overflow-visible",
                contentClassName,
              )}
            >
              {children}
            </div>
          )}
        </div>
        {showRailBar && (
          <RailBar
            leftLabel={leftSidebar != null ? leftLabel : null}
            historyLabel={sidebar != null ? HISTORY_LABEL : null}
            onOpen={setOpenRail}
          />
        )}
        {fan != null && (
          <div className="flex shrink-0 flex-col gap-2 px-4 pb-4 pt-2">
            {/* min-h (not h) — reserves one button-row of height so the board
                doesn't jump when actions appear/disappear, but never clips a
                taller control a game passes in. */}
            <div
              className={cn(
                "flex min-h-9 items-center justify-center",
                DEBUG_LAYOUT && "border-2 border-yellow-400 bg-yellow-400/10",
              )}
            >
              {fanActions}
            </div>
            <div className={cn(DEBUG_LAYOUT && "border-2 border-pink-400 bg-pink-400/10")}>
              {fan}
            </div>
          </div>
        )}
      </div>
      {railsInRow && sidebar && (
        <aside
          className={cn(
            "my-2 mr-2 flex w-history-rail shrink-0 flex-col overflow-y-auto rounded-card-xl bg-surface-900/60 p-4",
            DEBUG_LAYOUT && "border-2 border-cyan-400 bg-cyan-400/10",
          )}
        >
          <Eyebrow as="h3" size="lg" tone="neutral" className="mb-3 font-bold">
            {HISTORY_LABEL}
          </Eyebrow>
          {sidebar}
        </aside>
      )}
      {openRail === "left" && leftSidebar != null && (
        <Drawer side="bottom" title={leftLabel} onClose={() => setOpenRail(null)}>
          {leftSidebar}
        </Drawer>
      )}
      {openRail === "right" && sidebar != null && (
        <Drawer side="bottom" title={HISTORY_LABEL} onClose={() => setOpenRail(null)}>
          {sidebar}
        </Drawer>
      )}
    </div>
  );
}

// The phone rail bar: one pill per rail, sitting between the board and the
// fan tray. Each opens that rail's bottom sheet.
function RailBar({
  leftLabel,
  historyLabel,
  onOpen,
}: {
  leftLabel: string | null;
  historyLabel: string | null;
  onOpen: (rail: OpenRail) => void;
}) {
  return (
    <div
      data-testid="rail-bar"
      className="flex shrink-0 items-center justify-center gap-2 border-t border-line px-2 py-1.5"
    >
      {leftLabel && (
        <Button
          variant="secondary"
          size="xs"
          shape="pill"
          aria-haspopup="dialog"
          onClick={() => onOpen("left")}
        >
          {leftLabel}
        </Button>
      )}
      {historyLabel && (
        <Button
          variant="secondary"
          size="xs"
          shape="pill"
          aria-haspopup="dialog"
          onClick={() => onOpen("right")}
        >
          {historyLabel}
        </Button>
      )}
    </div>
  );
}
