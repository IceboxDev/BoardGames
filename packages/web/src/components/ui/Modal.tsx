import { AnimatePresence, motion } from "framer-motion";
import { type CSSProperties, type HTMLAttributes, type ReactNode, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { XIcon } from "../icons";
import { useBodyScrollLock, useDialogEscape, useFocusTrap } from "./dialog-a11y";

// Single dialog primitive. Owns: portal, backdrop, panel chrome, close X,
// focus trap, body-scroll lock, escape, role=dialog, aria-modal,
// aria-labelledby. Callers supply only content. Migrating a screen here
// guarantees consistent layering, animation, and a11y.
//
// ── Sizing ───────────────────────────────────────────────────────────────
//
// `size` is the ONLY sanctioned way to width a dialog. Every app-shell modal
// used to hand-write its own `max-w-…` (+ a `max-h-[90vh]`) through
// `panelClassName`, which produced seven different widths and four different
// scroll idioms. The scale below captures those clusters:
//
//   xs   (max-w-md)   confirms, single-field forms (LockIn, useConfirm)
//   sm   (max-w-lg)   focused flows (GenerateAvatar, GameDetail, ResetLink)
//   md   (max-w-xl)   prose + a CTA (CalendarSync)
//   lg   (max-w-2xl)  standard forms — the default (RecordMatch, EditProfile)
//   xl   (max-w-5xl)  multi-column documents (the D&D character sheet, which
//                     lays out an ability rail, saves+skills, and gear side by
//                     side and genuinely needs the width)
//   full              wide immersive canvas that grows on 4K (RsvpModal)
//
// Every non-`full` size carries `max-h-[90dvh]`, so the panel can never grow
// past the viewport. Pair it with `ModalBody` (which owns `min-h-0 flex-1
// overflow-y-auto`) and `ModalFooter` (which pins itself with `shrink-0`).
//
// `panelClassName` remains for non-sizing chrome (a tinted border) and for the
// not-yet-migrated game modals. Do NOT put `max-w-*`/`max-h-*` in it: when
// `size` is set, the two classes collide in the same CSS layer and the winner
// is decided by Tailwind's generated order, not by string order.

export type ModalSize = "xs" | "sm" | "md" | "lg" | "xl" | "full";

const SIZES: Record<ModalSize, string> = {
  xs: "max-w-md max-h-[90dvh]",
  sm: "max-w-lg max-h-[90dvh]",
  md: "max-w-xl max-h-[90dvh]",
  lg: "max-w-2xl max-h-[90dvh]",
  xl: "max-w-5xl max-h-[90dvh]",
  // The RSVP canvas: fills the viewport height and keeps widening on very
  // large displays instead of stranding the game carousel in a 42rem column.
  full: "h-full max-w-[80rem] xl:max-w-[92rem] 2xl:max-w-[110rem]",
};

type ModalProps = {
  onClose: () => void;
  /** Panel width + max-height. Omit only for legacy `panelClassName` callers. */
  size?: ModalSize;
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
  /** Non-sizing panel chrome (e.g. a tinted border). Never `max-w-*`/`max-h-*` — use `size`. */
  panelClassName?: string;
  /** Inline style on the panel. Mainly for setting a CSS custom property (e.g.
   *  a per-game `--accent`) that the eyebrow and body can then both consume. */
  style?: CSSProperties;
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
  "relative z-10 flex w-full flex-col gap-4 rounded-3xl border border-white/10 bg-surface-900/95 p-6 shadow-2xl shadow-black/60 outline-none";

export function Modal({
  onClose,
  size,
  eyebrow,
  eyebrowClassName = "text-amber-300",
  title,
  titleClassName = "text-xl font-bold tracking-tight text-white sm:text-2xl",
  ariaLabel,
  subheader,
  panelClassName,
  style,
  children,
  headerExtra,
  hideCloseButton = false,
  closeOnBackdrop = true,
  closeOnEscape = true,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const labelledBy = title ? titleId : undefined;

  // Width comes from exactly one source, never two: `size` when set, else the
  // caller's `panelClassName`, else the historical default. Emitting both a
  // `size` width and a `panelClassName` width would leave the winner to
  // Tailwind's CSS ordering (the larger `max-w-*` is generated later, so it
  // silently wins) rather than to the caller's intent.
  const sizeCls = size ? SIZES[size] : panelClassName ? "" : "max-w-2xl";

  useBodyScrollLock();
  useDialogEscape(closeOnEscape ? onClose : null);
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
          className={[PANEL_BASE, sizeCls, panelClassName].filter(Boolean).join(" ")}
          style={style}
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
                  className={`text-2xs font-semibold uppercase tracking-eyebrow ${eyebrowClassName}`}
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

// ── ModalBody ────────────────────────────────────────────────────────────
//
// The scrollable region of a dialog. Four modals had each invented their own
// idiom for "body scrolls, footer stays put" — `max-h-[60vh]`, `max-h-[68vh]`,
// `max-h-[calc(90vh-3rem)]`, and a `min-h-0 flex-1` — each with a different
// negative-margin scroll gutter (`-mr-2 pr-2`, `-mr-1 pr-1`, none).
//
// There is one correct answer: the panel caps its own height (`Modal size`),
// so the body just claims the leftover space with `min-h-0 flex-1` and scrolls
// inside it. No viewport math, no magic vh fractions. The `-mr-2 pr-2` pair
// pulls the scrollbar into the panel's padding so the track doesn't crowd the
// content.

type ModalBodyProps = HTMLAttributes<HTMLDivElement> & {
  /** Vertical rhythm between body children. Defaults to the form gap. */
  gap?: "sm" | "md";
  children: ReactNode;
};

const BODY_GAPS = { sm: "gap-3", md: "gap-4" } as const;

export function ModalBody({ gap = "sm", className = "", children, ...rest }: ModalBodyProps) {
  const cls = [
    "scrollbar-thin -mr-2 flex min-h-0 flex-1 flex-col overflow-y-auto pr-2",
    BODY_GAPS[gap],
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cls} {...rest}>
      {children}
    </div>
  );
}

// ── ModalFooter ──────────────────────────────────────────────────────────
//
// The dialog's action row. Collapses five hand-rebuilt footers that drifted on
// every axis: some were `justify-end`, some `justify-between` with a left slot;
// only one had the `border-t`; two used `size="sm"` buttons and two the default
// `md`; and two gated their primary with `disabled` instead of `loading`, so
// they showed no spinner while their mutation was in flight.
//
// `start` is the left slot (an error, a hint, a destructive "Remove" action).
// `children` are the trailing actions, right-aligned — conventionally a ghost
// Cancel followed by the primary. Use `size="sm"` buttons: the footer is a
// dense row, and `sm` is what the majority already used.

type ModalFooterProps = {
  /** Left-aligned slot: status text, an ErrorAlert, or a destructive action. */
  start?: ReactNode;
  /** Trailing actions (ghost Cancel, then the primary). */
  children: ReactNode;
  className?: string;
};

export function ModalFooter({ start, children, className = "" }: ModalFooterProps) {
  const cls = [
    "flex shrink-0 items-center justify-between gap-2 border-t border-white/10 pt-3",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <footer className={cls}>
      <div className="min-w-0">{start}</div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </footer>
  );
}
