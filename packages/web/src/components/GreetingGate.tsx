// App-wide mount for the greeting queue (GreetingHost). Lives in RootShell so
// a pending popup greets the viewer on ANY page, not just their profile —
// the purchase-vote nag depends on that. Renders nothing while logged out and
// on game surfaces (never interrupt active play). The old per-viewer
// `onlineMode` gate moved server-side into GET /api/greetings.
//
// Lazy: GreetingHost drags the skill modals and the vote carousel with it —
// none of that belongs in the initial bundle for a viewer with no greeting
// pending (the chunk loads in parallel with the greeting fetch).

import { lazy, Suspense } from "react";
import { useLocation } from "react-router-dom";
import { useCurrentUser } from "../hooks/useCurrentUser";

const GreetingHost = lazy(() => import("./profile/skill/GreetingHost"));

export function GreetingGate() {
  const { user } = useCurrentUser();
  const { pathname } = useLocation();
  if (!user || pathname.startsWith("/play/")) return null;
  return (
    <Suspense fallback={null}>
      <GreetingHost userId={user.id} />
    </Suspense>
  );
}
