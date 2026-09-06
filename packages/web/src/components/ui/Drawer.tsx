import { AnimatePresence, motion } from "framer-motion";
import { type ReactNode, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn";
import { XIcon } from "../icons";
import { DialogBackdrop } from "./DialogBackdrop";
import { useBodyScrollLock, useDialogEscape, useFocusTrap } from "./dialog-a11y";
import { IconButton } from "./IconButton";
import { Eyebrow } from "./Label";

// The edge-anchored sibling of Modal: a sliding panel dialog. Owns the
// portal, scrim, panel chrome, slide animation, close X, and the full dialog
// contract (focus trap, body-scroll lock, Escape, role=dialog, aria-modal,
// labelling) — the same guarantees as Modal, same prop names
// (eyebrow / title / subheader / ariaLabel), different geometry. Before this
// existed, the admin availability drawer hand-rolled the panel and shipped
// without a scrim or portal.
//
// Two edges:
//   right  (default) — the desktop inspector: full height, capped width.
//   bottom           — the phone sheet: full width, capped height, rounded
//                      top corners. GameScreen surfaces a board's rails here
//                      below `lg`, so a score panel or history log opens
//                      over the board instead of clipping it.

export type DrawerSide = "right" | "bottom";

type DrawerProps = {
  onClose: () => void;
  /** Which viewport edge the panel slides from. */
  side?: DrawerSide;
  /** Pre-title eyebrow text (uppercase tracked). */
  eyebrow?: ReactNode;
  /** Visible heading. Rendered as <h2>; doubles as aria-labelledby target. */
  title?: ReactNode;
  /** Required when `title` is omitted — labels the dialog for screen readers. */
  ariaLabel?: string;
  /** Inline content under the title (email, meta line, …). */
  subheader?: ReactNode;
  /** Disable backdrop-click-to-close. Defaults to true (closes). */
  closeOnBackdrop?: boolean;
  children: ReactNode;
};

const PANEL_BASE =
  "absolute flex flex-col border-line bg-surface-950 shadow-2xl shadow-black/50 outline-none";

const SIDE = {
  right: {
    panel: "inset-y-0 right-0 w-full max-w-md border-l sm:w-[28rem]",
    body: "flex min-h-0 flex-1 flex-col gap-3 px-4 py-4 sm:px-5",
    hidden: { x: 48, opacity: 0 },
    shown: { x: 0, opacity: 1 },
  },
  bottom: {
    // max-h keeps a strip of board visible above the sheet so the player never
    // loses the sense of where they are; the body scrolls inside the cap.
    panel: "inset-x-0 bottom-0 max-h-[85dvh] w-full rounded-t-card-3xl border-t",
    body: "scrollbar-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-6 pt-3",
    hidden: { y: 48, opacity: 0 },
    shown: { y: 0, opacity: 1 },
  },
} as const;

export function Drawer({
  onClose,
  side = "right",
  eyebrow,
  title,
  ariaLabel,
  subheader,
  closeOnBackdrop = true,
  children,
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const labelledBy = title ? titleId : undefined;
  const geometry = SIDE[side];

  useBodyScrollLock();
  useDialogEscape(onClose);
  useFocusTrap(panelRef);

  const overlay = (
    <AnimatePresence>
      <motion.div
        key="drawer"
        className="fixed inset-0 z-modal"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
      >
        <DialogBackdrop onDismiss={closeOnBackdrop ? onClose : undefined} />

        <motion.div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
          aria-label={labelledBy ? undefined : ariaLabel}
          tabIndex={-1}
          data-side={side}
          className={cn(PANEL_BASE, geometry.panel)}
          initial={geometry.hidden}
          animate={geometry.shown}
          exit={geometry.hidden}
          transition={{ type: "spring", stiffness: 260, damping: 30 }}
        >
          <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line-soft px-5 py-4">
            <div className="min-w-0">
              {eyebrow && (
                // Shared Eyebrow primitive at its `sm` density — same slot as
                // Modal's, one type ramp between them.
                <Eyebrow size="sm">{eyebrow}</Eyebrow>
              )}
              {title && (
                <h2 id={titleId} className="mt-1 truncate text-base font-semibold text-fg-strong">
                  {title}
                </h2>
              )}
              {subheader}
            </div>
            <IconButton
              variant="ghost"
              size="sm"
              aria-label="Close"
              onClick={onClose}
              icon={<XIcon />}
            />
          </header>

          <div className={geometry.body}>{children}</div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );

  if (typeof document === "undefined") return null;
  return createPortal(overlay, document.body);
}
