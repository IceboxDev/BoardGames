import { LoadingState } from "./ui/LoadingState";
import { PageShell } from "./ui/PageShell";

// ── RouteFallback / BoardFallback ────────────────────────────────────────
//
// The two sanctioned "something is on its way" screens.
//
//   RouteFallback — a whole page is not ready yet: the router is resolving a
//                   lazy route module on first load (`hydrateFallbackElement`
//                   in App.tsx) or the session is still being read
//                   (AuthGuard). Rendered on the SAME grid background every
//                   page uses, so first paint never flips from plain to grid
//                   when the page arrives — the old guard drew `plain`.
//
//   BoardFallback — a game chunk is loading INSIDE an already-mounted shell
//                   (GameRoute's Suspense boundaries). Fills the board area
//                   instead of leaving it blank; no PageShell, the shell is
//                   already there.
//
// Both route through <LoadingState>, so every wait in the app reads the same.

export function RouteFallback({ label }: { label?: string }) {
  return (
    <PageShell layout="centered" background="grid">
      <LoadingState label={label} />
    </PageShell>
  );
}

export function BoardFallback({ label = "Loading the board…" }: { label?: string }) {
  return <LoadingState fillHeight label={label} />;
}
