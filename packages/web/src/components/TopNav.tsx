import type { ReactNode } from "react";
import { Link } from "react-router-dom";

type TopNavProps = {
  /** Where the "Board Game Lab" logo links to. Defaults to "/". */
  homeHref?: string;
  /** Right-side content — back button, page actions, badges, etc. */
  children?: ReactNode;
};

/**
 * The unified top nav used by every full-page screen.
 * Sticky, with the "Board Game Lab" logo on the left and any actions on the right.
 */
export function TopNav({ homeHref = "/", children }: TopNavProps) {
  return (
    <nav className="sticky top-0 z-50 shrink-0 border-b nav-border bg-surface-950/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
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
          <span className="text-sm font-semibold tracking-wide text-gray-300 transition group-hover:text-white">
            Board Game Lab
          </span>
        </Link>
        {children && <div className="flex items-center gap-2">{children}</div>}
      </div>
    </nav>
  );
}

type BackButtonProps = {
  to: string;
  label?: string;
  /** Optional click handler; if it calls preventDefault, navigation is suppressed. */
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
};

/** The standard left-arrow Back / Dashboard button used in the right slot of `<TopNav>`. */
export function TopNavBackButton({ to, label = "Back", onClick }: BackButtonProps) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-gray-500 transition hover:bg-surface-800 hover:text-gray-300"
    >
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
  const className =
    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-gray-500 transition hover:bg-surface-800 hover:text-gray-300";
  if (to) {
    return (
      <Link to={to} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  );
}
