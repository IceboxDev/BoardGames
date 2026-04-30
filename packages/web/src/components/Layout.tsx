import { Outlet, useLocation } from "react-router-dom";
import { GameBackOverrideProvider } from "../contexts/GameBackOverrideProvider";
import { useGameBackOverride } from "../hooks/useGameBackOverride";
import { TopNav, TopNavBackButton } from "./TopNav";

function LayoutInner() {
  const { pathname } = useLocation();
  const { overrideRef } = useGameBackOverride();
  const isHome = pathname === "/games";
  const backHref = isHome ? "/" : "/games";
  const backLabel = isHome ? "Dashboard" : "Back";

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden">
      <TopNav homeHref="/games">
        <TopNavBackButton
          to={backHref}
          label={backLabel}
          onClick={(e) => {
            if (overrideRef.current) {
              e.preventDefault();
              overrideRef.current();
            }
          }}
        />
      </TopNav>

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
