import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { createPortal } from "react-dom";

// Lighter sibling of Modal for passive previews (card hover-zoom, action-log
// art tooltips). Mounted = visible. No focus trap, no role="dialog" — the
// overlay holds inert content. Sits on the `z-tooltip` layer so card
// previews still surface above an open modal.

type OverlayProps = {
  /** Triggered by Escape and by clicking the backdrop. */
  onClose: () => void;
  /** Disable Escape-to-close. Defaults to true. */
  closeOnEscape?: boolean;
  /** When true, click anywhere (including the content) closes. Defaults to true. */
  closeOnClick?: boolean;
  /** Additional classes on the inner content wrapper. */
  contentClassName?: string;
  children: ReactNode;
};

const SPRING = { type: "spring" as const, stiffness: 300, damping: 25 };

export function Overlay({
  onClose,
  closeOnEscape = true,
  closeOnClick = true,
  contentClassName,
  children,
}: OverlayProps) {
  useEffect(() => {
    if (!closeOnEscape) return;
    function handle(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [closeOnEscape, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="overlay"
        className="fixed inset-0 z-tooltip flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
      >
        <button
          type="button"
          aria-label="Close preview"
          tabIndex={-1}
          onClick={closeOnClick ? onClose : undefined}
          className={`absolute inset-0 bg-surface-950/85 backdrop-blur-sm ${
            closeOnClick ? "cursor-default" : "cursor-default pointer-events-none"
          }`}
        />
        <motion.div
          className={`pointer-events-none relative z-10${contentClassName ? ` ${contentClassName}` : ""}`}
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.85, opacity: 0 }}
          transition={SPRING}
        >
          {children}
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
