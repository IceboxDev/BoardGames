import { AnimatePresence, motion } from "framer-motion";
import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";

// ── BoardOverlay ─────────────────────────────────────────────────────────
//
// The peek-capable in-board overlay primitive — the shared shell behind the
// game "discussion / choice" overlays (Sky Team briefing, Parks passion pick)
// that keep the board mounted underneath so the player never leaves it.
//
// Owns: the portal into #app-main (so it fills the content area below the
// sticky nav), the blurred backdrop, the floating "peek" toggle that hides the
// overlay to study the board and brings it back, Escape-to-peek, and the
// `z-overlay` stacking layer. Game-flavored chrome (backdrop tint, toggle
// color, and the panel itself) is supplied by the caller — the panel is
// `children`.
//
// This is deliberately NOT `Modal`. Modal is a body-portaled, focus-trapping
// dialog with surface chrome; a board overlay is content-area-portaled, has no
// "close" (the player must act, or peek), and wraps full-bleed game art.
// Merging the two would bloat both — so the four true dialogs use `Modal`, and
// these two peek overlays use this.

type BoardOverlayProps = {
  /** Toggle copy while the overlay is shown (the "hide" action). */
  hideLabel: string;
  hideIcon?: ReactNode;
  /** Toggle copy while the overlay is hidden (the "show" action). */
  showLabel: string;
  showIcon?: ReactNode;
  /** Backdrop tint (game-flavored), e.g. "bg-surface-950/70". */
  backdropClassName?: string;
  /** Floating toggle button color (game-flavored). */
  toggleClassName?: string;
  children: ReactNode;
};

export function BoardOverlay({
  hideLabel,
  hideIcon,
  showLabel,
  showIcon,
  backdropClassName = "bg-surface-950/70",
  toggleClassName = "border-white/20 bg-surface-800 hover:bg-surface-700",
  children,
}: BoardOverlayProps) {
  const [hidden, setHidden] = useState(false);

  // Escape toggles the peek so keyboard users can drop the overlay to study the
  // board (and bring it back) without reaching for the floating button.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setHidden((h) => !h);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Portal into <main> (not body) so the overlay sits below the sticky nav and
  // fills exactly the content area (#app-main is position:relative).
  const target = typeof document !== "undefined" ? document.getElementById("app-main") : null;
  if (!target) return null;

  return createPortal(
    <div className="absolute inset-0 z-overlay">
      <AnimatePresence>
        {!hidden && (
          <motion.div
            key="board-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`absolute inset-0 flex items-center justify-center px-4 backdrop-blur-md ${backdropClassName}`}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating peek toggle — above the backdrop within the overlay layer so
          the player can drop the overlay to study the board, then restore it. */}
      {/* biome-ignore lint/correctness/noRestrictedElements: portal-internal floating overlay toggle */}
      <button
        type="button"
        onClick={() => setHidden((h) => !h)}
        title={hidden ? showLabel : hideLabel}
        className={`absolute right-4 top-4 z-10 flex items-center gap-2 rounded-full border-2 px-4 py-2 text-xs font-bold text-white shadow-lg transition hover:scale-105 ${toggleClassName}`}
      >
        <span className="text-base leading-none">{hidden ? showIcon : hideIcon}</span>
        <span>{hidden ? showLabel : hideLabel}</span>
      </button>
    </div>,
    target,
  );
}
