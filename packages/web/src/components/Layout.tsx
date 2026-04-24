import { Link, Outlet, useLocation } from "react-router-dom";
import { GameBackOverrideProvider } from "../contexts/GameBackOverrideProvider";
import { useGameBackOverride } from "../hooks/useGameBackOverride";

function LayoutInner() {
  const { pathname } = useLocation();
  const { overrideRef } = useGameBackOverride();
  const isHome = pathname === "/";

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden">
      <nav className="sticky top-0 z-50 shrink-0 border-b nav-border bg-surface-950/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link to="/" className="flex items-center gap-2.5 group">
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

          <Link
            to="/"
            onClick={(e) => {
              if (overrideRef.current) {
                e.preventDefault();
                overrideRef.current();
              }
            }}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-gray-500 transition hover:bg-surface-800 hover:text-gray-300 ${isHome ? "invisible" : ""}`}
            tabIndex={isHome ? -1 : undefined}
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z"
                clipRule="evenodd"
              />
            </svg>
            Back
          </Link>
        </div>
      </nav>

      {/* biome-ignore lint/correctness/useUniqueElementIds: singleton — only one Layout is mounted, used as a portal target by game overlays */}
      <main id="app-main" className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}

export default function Layout() {
  return (
    <GameBackOverrideProvider>
      <LayoutInner />
    </GameBackOverrideProvider>
  );
}
