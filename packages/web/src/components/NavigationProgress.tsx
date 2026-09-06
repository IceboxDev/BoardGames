import { useEffect, useState } from "react";
import { useNavigation } from "react-router-dom";

// ── NavigationProgress ───────────────────────────────────────────────────
//
// The thin accent bar under the top edge while the data router is between
// pages — resolving a lazy route module on a cold cache, or running a loader.
// With route-level `lazy`, React Router keeps the CURRENT page on screen
// until the next one is ready (no blank flash), so this is the only signal
// the user gets that the click registered. Rendered once in `RootShell`.
//
// A short delay before it appears keeps a warm-cache navigation (a few ms)
// from flickering a bar that nobody would have time to see.

const SHOW_AFTER_MS = 120;

export function NavigationProgress() {
  const { state } = useNavigation();
  const busy = state !== "idle";
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!busy) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [busy]);

  if (!visible) return null;
  return (
    <div
      role="progressbar"
      aria-label="Loading page"
      aria-valuetext="Loading"
      className="pointer-events-none fixed inset-x-0 top-0 z-tooltip h-0.5 overflow-hidden bg-accent-500/20"
    >
      <div className="animate-nav-progress h-full w-1/3 bg-accent-400 shadow-glow-accent" />
    </div>
  );
}
