import { type ReactNode, type Ref, useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { XIcon } from "../icons";
import { DialogBackdrop } from "../ui/DialogBackdrop";
import { useBodyScrollLock, useDialogEscape, useFocusTrap } from "../ui/dialog-a11y";
import { IconButton } from "../ui/IconButton";

// The full-screen rules chrome: header bar (title • tabs • close), the
// backdrop, the dialog contract (scroll lock, focus trap, Escape) and the
// scrolling body, extracted from `RulesViewer` so the chrome is one place.
// It lives at `/play/:slug/rules`, so `onClose` navigates Back and must fire
// at most once — `closingRef` guards against a double dismiss during the
// 200 ms fade-out.

export interface RulesShellTab {
  label: string;
}

interface RulesShellProps {
  /** Header title. Defaults to "Game Rules". */
  title?: string;
  /** Muted note beside the title ("12 pages"). */
  meta?: ReactNode;
  /** Pill tabs in the header's middle zone; rendered only when > 1. */
  tabs?: readonly RulesShellTab[];
  activeTab?: number;
  onTabChange?: (index: number) => void;
  /** Accessible name of the tab list. */
  tabsLabel?: string;
  /** The scrolling body — callers scroll it to the top or to a section. */
  scrollRef?: Ref<HTMLDivElement>;
  /** Classes on the scrolling body (padding lives here). */
  bodyClassName?: string;
  onClose: () => void;
  children: ReactNode;
}

export function RulesShell({
  title = "Game Rules",
  meta,
  tabs = [],
  activeTab = 0,
  onTabChange,
  tabsLabel = "Rules booklets",
  scrollRef,
  bodyClassName = "px-6 py-8",
  onClose,
  children,
}: RulesShellProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);

  useBodyScrollLock();
  useFocusTrap(dialogRef);

  const closingRef = useRef(false);
  const handleClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    setTimeout(onClose, 200);
  }, [onClose]);

  useDialogEscape(handleClose);

  const overlay = (
    <div
      className={`fixed inset-0 z-modal flex flex-col transition-opacity duration-200 ${closing ? "opacity-0" : "opacity-100"}`}
    >
      <DialogBackdrop onDismiss={handleClose} label="Dismiss rules" />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Game rules"
        tabIndex={-1}
        className="relative z-raised flex min-h-0 flex-1 flex-col outline-none"
      >
        {/* Header bar — three zones (title • tabs • close). The middle is a
            flex-1 spacer when there's only one booklet, so the title and X
            still anchor to opposite ends; with several, the tab pills live in
            that same slot, horizontally centered and scrollable on a phone. */}
        <div className="flex shrink-0 items-center border-b border-line-soft bg-surface-950/80 px-4 py-3 backdrop-blur-md sm:px-6">
          <div className="flex shrink-0 items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-card-lg bg-amber-500/10 text-amber-400">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                <path d="M10.75 16.82A7.462 7.462 0 0115 15.5c.71 0 1.396.098 2.046.282A.75.75 0 0018 15.06V3.56a.75.75 0 00-.546-.722A9.006 9.006 0 0015 2.5a9.006 9.006 0 00-4.25 1.065v13.255zM9.25 4.565A9.006 9.006 0 005 2.5a9.006 9.006 0 00-2.454.338A.75.75 0 002 3.56v11.5a.75.75 0 00.954.722A7.462 7.462 0 015 15.5a7.462 7.462 0 014.25 1.32V4.565z" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-fg-strong">{title}</span>
            {meta && <span className="text-xs tabular-nums text-fg-muted">{meta}</span>}
          </div>

          {tabs.length > 1 ? (
            <div
              role="tablist"
              aria-label={tabsLabel}
              className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-3 [scrollbar-width:none] sm:justify-center sm:px-4 [&::-webkit-scrollbar]:hidden"
            >
              {tabs.map((t, i) => {
                const active = i === activeTab;
                return (
                  // biome-ignore lint/correctness/noRestrictedElements: tab control needs role/aria-selected semantics and a bespoke pill style that <Button> doesn't expose
                  <button
                    key={t.label}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => onTabChange?.(i)}
                    className={
                      active
                        ? "shrink-0 whitespace-nowrap rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-300 ring-1 ring-amber-400/30 transition-colors"
                        : "shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs text-fg-secondary transition-colors hover:bg-fill-soft hover:text-fg-primary"
                    }
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex-1" aria-hidden="true" />
          )}

          <IconButton
            variant="ghost"
            size="sm"
            aria-label="Close rules"
            onClick={handleClose}
            icon={<XIcon className="h-5 w-5" />}
          />
        </div>

        {/* Scrollable body */}
        <div
          ref={scrollRef}
          className={`min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${bodyClassName}`}
        >
          {children}
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(overlay, document.body);
}
