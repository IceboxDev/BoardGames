import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { reportPageView } from "../lib/page-views";

/**
 * Route-level page-view beacon. Mounted once in RootShell so every
 * navigation is classified centrally — individual pages stay untouched.
 * UI-level views that aren't routes (opening a night's RSVP card) report
 * from their own component instead (see RsvpModal).
 */
export function PageViewTracker() {
  const location = useLocation();
  const { user } = useCurrentUser();

  useEffect(() => {
    if (!user) return;
    const view = classify(location.pathname);
    if (view) reportPageView(view.page, view.detail);
  }, [location.pathname, user]);

  return null;
}

/**
 * Map a pathname to a loggable surface. Returns null for surfaces that are
 * uninteresting or already logged elsewhere (`/u/:id` profile views are
 * logged server-side with the viewer AND target; `/login`, dev previews,
 * and deep game sub-routes below the shell add nothing).
 */
function classify(pathname: string): { page: string; detail?: string } | null {
  if (pathname === "/") return { page: "home" };
  if (pathname === "/offline") return { page: "calendar" };
  if (pathname === "/history") return { page: "history" };
  if (pathname === "/players") return { page: "players" };
  if (pathname === "/admin") return { page: "admin" };
  if (pathname === "/games") return { page: "games" };
  const play = pathname.match(/^\/play\/([^/]+)/);
  if (play) return { page: "play", detail: play[1] };
  return null;
}
