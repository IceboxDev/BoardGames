import { Outlet, useLocation } from "react-router-dom";
import { TopNav, TopNavBackButton } from "./TopNav";
import { PageMain, PageShell } from "./ui/PageShell";

/**
 * Compute the back destination from the current pathname. Walks one
 * segment up the route tree until it hits a special anchor:
 *
 *   - `/games` → `/` (dashboard)
 *   - `/play/:slug` → `/games`
 *   - `/play/:slug/<anything-else>` → `/play/:slug` (mode select)
 *
 * Replaces the previous `useGameBackOverride` mechanism, which existed
 * only because shell state lived in component state instead of the URL.
 * Now that every screen has a URL, the back destination is a pure
 * function of the pathname — no override registry, no ref passing.
 */
function backTarget(pathname: string): { href: string; label: string } {
  if (pathname === "/games" || pathname === "/games/") {
    return { href: "/", label: "Dashboard" };
  }
  // `/play/:slug` (no further segments) → top-level catalog.
  const playSegments = pathname.replace(/^\/+|\/+$/g, "").split("/");
  if (playSegments[0] === "play" && playSegments.length === 2) {
    return { href: "/games", label: "Back" };
  }
  // `/play/:slug/solo/<deeper…>` → one level up. The solo subtree is the
  // only place games host internal sub-routes (the D&D tool's hall → setup
  // → session screens), and there Back should unwind one screen, not jump
  // to the mode picker.
  if (playSegments[0] === "play" && playSegments[2] === "solo" && playSegments.length > 3) {
    return { href: `/${playSegments.slice(0, -1).join("/")}`, label: "Back" };
  }
  // `/play/:slug/<screen>` (any other sub-route) → mode select.
  if (playSegments[0] === "play" && playSegments.length > 2) {
    return { href: `/play/${playSegments[1]}`, label: "Back" };
  }
  return { href: "/games", label: "Back" };
}

export default function Layout() {
  const { pathname } = useLocation();
  const { href, label } = backTarget(pathname);

  return (
    <PageShell
      layout="fixed"
      background="none"
      topNav={
        <TopNav homeHref="/games">
          <TopNavBackButton to={href} label={label} />
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

// Exported only for unit tests; not part of the public component API.
// biome-ignore lint/style/useComponentExportOnlyModules: tiny pure helper, exported for unit-test pinning of the parent-route resolver
export { backTarget };
