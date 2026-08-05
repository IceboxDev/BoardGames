import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { reportDevice } from "../lib/device-info";
import { reportPageView } from "../lib/page-views";

/**
 * Route-level page-view + device beacon. Mounted once in RootShell so every
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

  // Device/viewport telemetry: once on login/mount, again on real viewport
  // changes (rotation, window resize, zoom — all fire `resize`), debounced so
  // drag-resizing reports the settled size. `reportDevice` self-throttles
  // same-signature repeats, so this stays chatty-proof.
  useEffect(() => {
    if (!user) return;
    reportDevice();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(reportDevice, 2000);
    };
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, [user]);

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
