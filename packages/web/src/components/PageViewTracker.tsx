import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { reportDevice } from "../lib/device-info";
import { classifyRoute } from "../lib/page-classify";
import { isQuietNavState, reportPageView, viaFromNavState } from "../lib/page-views";

/**
 * Route-level page-view + device beacon. Mounted once in RootShell so every
 * navigation is classified centrally (`lib/page-classify.ts`) — individual
 * pages stay untouched. UI-level views that aren't routes (a night's RSVP
 * card, a greeting) report from their own component instead.
 */
export function PageViewTracker() {
  const location = useLocation();
  const { user } = useCurrentUser();
  // The route last reported: a search-param change that classifies to the
  // same view (a catalog filter, the calendar's `?date=`) is not a new look.
  const lastRouteRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const view = classifyRoute(location.pathname, location.search);
    const key = view ? `${view.page}:${view.detail ?? ""}` : null;
    if (key === lastRouteRef.current) return;
    lastRouteRef.current = key;
    if (isQuietNavState(location.state)) return;
    if (view) reportPageView(view.page, view.detail, { via: viaFromNavState(location.state) });
  }, [location.pathname, location.search, location.state, user]);

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
