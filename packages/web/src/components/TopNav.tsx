import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "../lib/cn";
import { Button } from "./ui/Button";

// ── TopNav ───────────────────────────────────────────────────────────────
//
// The unified top nav used by every full-page screen. Sticky, with the
// "Board Game Lab" logo on the left and the back button + page actions on
// the right.
//
// The inner bar is deliberately FULL-BLEED (`w-full px-6`), never capped to
// the page's content width. The logo is brand chrome anchored to the
// viewport, so it sits at the identical x-position on every page. A previous
// revision capped the bar per-page ("so the nav edges align with the content
// below"), which made the logo jump 64px+ between e.g. Players (6xl) and
// Admin (7xl) — cross-page stability wins over per-page edge alignment, and
// pages with `width="full"` content never aligned anyway. Do NOT reintroduce
// a width prop here; `TopNav.test.tsx` pins this invariant.
//
// Slots (position is enforced, not conventional — sibling pages used to
// disagree on whether Back rendered before or after the links):
//   back     — the TopNavBackButton. Always FIRST in the right cluster.
//   children — page actions/links (TopNavLink, badges), after `back`.

type TopNavProps = {
  /** Where the "Board Game Lab" logo links to. Defaults to "/". */
  homeHref?: string;
  /** The back button slot — always rendered first in the right cluster. */
  back?: ReactNode;
  /** Right-side page actions — links, badges, sign-out. Rendered after `back`. */
  children?: ReactNode;
};

export function TopNav({ homeHref = "/", back, children }: TopNavProps) {
  return (
    <nav className="sticky top-0 z-nav shrink-0 border-b nav-border bg-surface-950/90 backdrop-blur-xl">
      <div className="flex w-full items-center justify-between px-6 py-3">
        <Link to={homeHref} className="group flex items-center gap-2.5">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-5 w-5 text-accent-400 transition group-hover:text-accent-300"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          <span className="text-sm font-semibold tracking-wide text-fg-secondary transition group-hover:text-white">
            Board Game Lab
          </span>
        </Link>
        {(back || children) && (
          <div className="flex items-center gap-2">
            {back}
            {children}
          </div>
        )}
      </div>
    </nav>
  );
}

// Shared chrome for the right-cluster controls — one string, consumed by both
// the Link and Button renderings so they cannot drift apart.
const NAV_ACTION_CLS =
  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-fg-muted transition hover:bg-surface-800 hover:text-fg-secondary";

type BackButtonProps = {
  to: string;
  label?: string;
  /** Optional click handler; if it calls preventDefault, navigation is suppressed. */
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
};

/** The standard left-arrow Back / Dashboard button. Pass via `<TopNav back={…}>`. */
export function TopNavBackButton({ to, label = "Back", onClick }: BackButtonProps) {
  return (
    <Link to={to} onClick={onClick} className={NAV_ACTION_CLS}>
      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z"
          clipRule="evenodd"
        />
      </svg>
      {label}
    </Link>
  );
}

/** A plain text/button action for the right slot — same styling as the back button. */
export function TopNavLink({
  to,
  children,
  onClick,
}: {
  to?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  if (to) {
    return (
      <Link to={to} className={NAV_ACTION_CLS}>
        {children}
      </Link>
    );
  }
  // Pure-text top-nav action — uses Button's `link` variant for color +
  // hover behavior, but composes nav-specific padding/radius on top so it
  // sits exactly aligned with the sibling Link variant above.
  return (
    <Button variant="link" onClick={onClick} className={cn(NAV_ACTION_CLS)}>
      {children}
    </Button>
  );
}
