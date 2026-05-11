import { Outlet, useLocation } from "react-router-dom";
import { GameBackOverrideProvider } from "../contexts/GameBackOverrideProvider";
import { useGameBackOverride } from "../hooks/useGameBackOverride";
import { TopNav, TopNavBackButton } from "./TopNav";
import { PageMain, PageShell } from "./ui/PageShell";

function LayoutInner() {
  const { pathname } = useLocation();
  const { overrideRef } = useGameBackOverride();
  const isHome = pathname === "/games";
  const backHref = isHome ? "/" : "/games";
  const backLabel = isHome ? "Dashboard" : "Back";

  return (
    <PageShell
      layout="fixed"
      background="none"
      topNav={
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
      }
    >
      {/* `id="app-main"` is a singleton portal target — `PassionPickOverlay`
          (and any future game overlays) call `getElementById("app-main")` to
          mount above the board. `relative overflow-hidden` keeps absolute
          children scoped to this main and prevents the page from scrolling
          when a game's internal layout overflows momentarily. */}
      {/* biome-ignore lint/correctness/useUniqueElementIds: singleton — only one Layout is mounted; portal target for game overlays */}
      <PageMain
        id="app-main"
        width="full"
        padding="none"
        fillHeight
        className="relative overflow-hidden"
      >
        <Outlet />
      </PageMain>
    </PageShell>
  );
}

export default function Layout() {
  return (
    <GameBackOverrideProvider>
      <LayoutInner />
    </GameBackOverrideProvider>
  );
}
