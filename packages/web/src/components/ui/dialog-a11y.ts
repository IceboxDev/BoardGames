import { type RefObject, useEffect } from "react";

// ── Dialog accessibility hooks ───────────────────────────────────────────
//
// The a11y machinery shared by every modal-class surface: the centered
// `Modal`, the full-screen `RulesViewer`, and the side `AvailabilityDrawer`.
// Each surface looks different, but they owe the user the same contract —
// background scroll is locked, Escape closes, focus is trapped inside while
// open and restored to the trigger on close. Extracted from `Modal` so a
// bespoke-shaped dialog can opt into the same guarantees instead of
// re-implementing (and mis-implementing) them.

/** Lock `<body>` scroll for the lifetime of the calling component. */
export function useBodyScrollLock() {
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);
}

/** Call `onEscape` when Escape is pressed. Pass `null` to disable. */
export function useDialogEscape(onEscape: (() => void) | null) {
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

/**
 * Trap Tab focus inside `panelRef` while mounted. Focuses the panel on mount
 * (so screen readers announce the dialog) and restores focus to the
 * previously-focused element on unmount when it's still in the DOM.
 */
export function useFocusTrap(panelRef: RefObject<HTMLElement | null>) {
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
      // Restore focus to the trigger when the dialog closes (only if the
      // previously-focused element is still in the DOM — otherwise leave it
      // alone so the page's natural tab order takes over).
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [panelRef]);
}
