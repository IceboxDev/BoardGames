import { useCallback, useSyncExternalStore } from "react";

// ── useMediaQuery ────────────────────────────────────────────────────────
//
// Subscribe to a CSS media query as React state, via `useSyncExternalStore`
// so the first render already reads the real match (no `false` flash on
// mount, no effect-then-setState double render) and a query change is a
// tearing-safe external-store update.
//
// Use it when a layout decision has to be made in JS — mounting a rail in a
// sidebar OR in a bottom sheet, never both — rather than in CSS. When both
// branches can simply exist in the DOM, prefer `hidden lg:flex`; that costs
// nothing and needs no subscription.

/** Tailwind's `lg` breakpoint (64rem) — where a game board gets its rails. */
export const WIDE_BOARD_QUERY = "(min-width: 64rem)";

function subscribe(query: string, onChange: () => void): () => void {
  const mq = window.matchMedia(query);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

export function useMediaQuery(query: string): boolean {
  const subscribeToQuery = useCallback(
    (onChange: () => void) => subscribe(query, onChange),
    [query],
  );
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);
  // Server snapshot: no viewport, so "not wide". Vite SPA never hits it, but
  // the hook stays correct if a route is ever pre-rendered.
  return useSyncExternalStore(subscribeToQuery, getSnapshot, () => false);
}
