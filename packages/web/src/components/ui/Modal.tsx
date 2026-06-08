import { AnimatePresence, motion } from "framer-motion";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { XIcon } from "../icons";

// Single dialog primitive. Owns: portal, backdrop, panel chrome, close X,
// focus trap, body-scroll lock, escape, role=dialog, aria-modal,
// aria-labelledby. Callers supply only content. Migrating a screen here
// guarantees consistent layering, animation, and a11y.

type ModalProps = {
  onClose: () => void;
  /** Pre-title eyebrow text (uppercase tracked). */
  eyebrow?: ReactNode;
  /** Color class for the eyebrow. */
  eyebrowClassName?: string;
  /** Visible heading. Rendered as <h2>; doubles as aria-labelledby target. */
  title?: ReactNode;
  /** Override heading typography (defaults to bold xl/2xl). */
  titleClassName?: string;
  /** Required when `title` is omitted — labels the dialog for screen readers. */
  ariaLabel?: string;
  /** Inline content under the title (subtitle, attendee summary, …). */
  subheader?: ReactNode;
  /** Sized class set for the panel — e.g. "max-w-md", "max-w-2xl max-h-[90vh]". */
  panelClassName?: string;
  /** Body content. */
  children?: ReactNode;
  /** Optional action element placed left of the close X (e.g. picks-lock toggle). */
  headerExtra?: ReactNode;
  /** Hide the built-in close X (rare — only when caller provides their own). */
  hideCloseButton?: boolean;
  /** Disable backdrop-click-to-close. Defaults to true (closes). */
  closeOnBackdrop?: boolean;
  /** Disable Escape-to-close. Defaults to true (closes). */
  closeOnEscape?: boolean;
};

const PANEL_BASE =
  "relative z-10 flex w-full max-w-2xl flex-col gap-4 rounded-3xl border border-white/10 bg-surface-900/95 p-6 shadow-2xl shadow-black/60 outline-none";

export function Modal({
  onClose,
  eyebrow,
  eyebrowClassName = "text-amber-300",
  title,
  titleClassName = "text-xl font-bold tracking-tight text-white sm:text-2xl",
  ariaLabel,
  subheader,
  panelClassName,
  children,
  headerExtra,
  hideCloseButton = false,
  closeOnBackdrop = true,
  closeOnEscape = true,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const labelledBy = title ? titleId : undefined;

  useBodyScrollLock();
  useEscape(closeOnEscape ? onClose : null);
  useFocusTrap(panelRef);

  const overlay = (
    <AnimatePresence>
      <motion.div
        key="modal"
        className="fixed inset-0 z-modal flex items-center justify-center px-3 py-4 sm:px-4 sm:py-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
      >
        <button
          type="button"
          aria-label="Close"
          tabIndex={-1}
          onClick={closeOnBackdrop ? onClose : undefined}
          className={`absolute inset-0 bg-surface-950/85 backdrop-blur-sm ${
            closeOnBackdrop ? "cursor-default" : "cursor-default pointer-events-none"
          }`}
        />

        <motion.div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
          aria-label={labelledBy ? undefined : ariaLabel}
          tabIndex={-1}
          className={`${PANEL_BASE}${panelClassName ? ` ${panelClassName}` : ""}`}
          initial={{ y: 16, scale: 0.96, opacity: 0 }}
          animate={{ y: 0, scale: 1, opacity: 1 }}
          exit={{ y: 16, scale: 0.96, opacity: 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 26 }}
        >
          {(headerExtra || !hideCloseButton) && (
            <div className="absolute right-4 top-4 z-20 flex items-center gap-1">
              {headerExtra}
              {!hideCloseButton && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="rounded-md p-1.5 text-fg-secondary transition hover:bg-white/5 hover:text-white"
                >
                  <XIcon />
                </button>
              )}
            </div>
          )}

          {(title || eyebrow || subheader) && (
            <header className="flex min-w-0 flex-col items-start gap-1 pr-20">
              {eyebrow && (
                <p
                  className={`text-2xs font-semibold uppercase tracking-[0.25em] ${eyebrowClassName}`}
                >
                  {eyebrow}
                </p>
              )}
              {title && (
                <h2 id={titleId} className={titleClassName}>
                  {title}
                </h2>
              )}
              {subheader}
            </header>
          )}

          {children}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );

  if (typeof document === "undefined") return null;
  return createPortal(overlay, document.body);
}

// ── Hooks ─────────────────────────────────────────────────────────────

function useBodyScrollLock() {
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);
}

function useEscape(onEscape: (() => void) | null) {
  useEffect(() => {
    if (!onEscape) return;
    function handle(e: KeyboardEvent) {
      if (e.key === "Escape") onEscape?.();
    }
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [onEscape]);
}

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function useFocusTrap(panelRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Focus the panel itself initially so screen readers announce the
    // dialog. Tab from there moves into the first focusable child.
    panel.focus({ preventScroll: true });

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const focusable = Array.from(
        panel?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
      ).filter((el) => el.offsetParent !== null);
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || active === panel || !panel?.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Restore focus to the trigger when the modal closes (only if the
      // previously-focused element is still in the DOM — otherwise leave it
      // alone so the page's natural tab order takes over).
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [panelRef]);
}
