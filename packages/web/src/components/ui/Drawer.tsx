import { AnimatePresence, motion } from "framer-motion";
import { type ReactNode, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { XIcon } from "../icons";
import { DialogBackdrop } from "./DialogBackdrop";
import { useBodyScrollLock, useDialogEscape, useFocusTrap } from "./dialog-a11y";
import { IconButton } from "./IconButton";

// The edge-anchored sibling of Modal: a right-side sliding panel dialog.
// Owns the portal, scrim, panel chrome, slide animation, close X, and the
// full dialog contract (focus trap, body-scroll lock, Escape, role=dialog,
// aria-modal, labelling) — the same guarantees as Modal, same prop names
// (eyebrow / title / subheader / ariaLabel), different geometry. Before this
// existed, the admin availability drawer hand-rolled the panel and shipped
// without a scrim or portal.

type DrawerProps = {
  onClose: () => void;
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

export function Drawer({
  onClose,
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
          className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-white/10 bg-surface-950 shadow-2xl shadow-black/50 outline-none sm:w-[28rem]"
          initial={{ x: 48, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 48, opacity: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 30 }}
        >
          <header className="flex shrink-0 items-start justify-between gap-3 border-b border-white/5 px-5 py-4">
            <div className="min-w-0">
              {eyebrow && (
                <p className="text-3xs font-semibold uppercase tracking-eyebrow text-accent-400">
                  {eyebrow}
                </p>
              )}
              {title && (
                <h2 id={titleId} className="mt-1 truncate text-base font-semibold text-white">
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

          <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-4 sm:px-5">{children}</div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );

  if (typeof document === "undefined") return null;
  return createPortal(overlay, document.body);
}
