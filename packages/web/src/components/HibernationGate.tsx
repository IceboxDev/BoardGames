import { lazy, type ReactNode, Suspense } from "react";
import { useLocation } from "react-router-dom";
import { useSiteStatus } from "../hooks/useSiteStatus.ts";
import { openWhileHibernated } from "../lib/site.ts";
import { RouteFallback } from "./RouteFallback";

// Only ever needed while the site sleeps: kept out of the entry chunk.
const GoodbyePage = lazy(() => import("../pages/GoodbyePage"));

/**
 * The site-wide hibernation switch, mounted once in RootShell. Until the
 * first answer arrives it shows the loading screen — rendering the app early
 * would let the sign-in guard bounce a signed-out visitor to /login before
 * the goodbye screen could take over. Awake (or with the status unreachable)
 * it renders the app untouched. Asleep, every route shows the goodbye screen except the online
 * area for members with online access, the admin console for the admin, and
 * the sign-in page (by typed URL only — nothing links to it).
 *
 * `children` is the whole normal shell, so the greeting popups and page-view
 * beacons simply don't run behind the goodbye screen.
 */
export function HibernationGate({ children }: { children: ReactNode }) {
  const { data: status, isError } = useSiteStatus();
  const { pathname } = useLocation();
  if (!status && !isError) return <RouteFallback />;
  if (!status?.hibernated || openWhileHibernated(pathname, status)) return children;
  return (
    <Suspense fallback={<RouteFallback />}>
      <GoodbyePage
        memorial={status.memorial}
        onlineAccess={status.onlineAccess}
        admin={status.admin}
      />
    </Suspense>
  );
}
