import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { BoardOverlay, Eyebrow, Kbd } from "../../../components/ui";
import { cn } from "../../../lib/cn";

/**
 * Every choice the game asks for mid-play (how to pay, Halikarnassos's pick
 * from the discard) — over the board, never instead of it. The floating
 * toggle (or Esc) drops the panel so the whole table can be studied, views
 * switched and cards previewed, then brings the choice back.
 */
export default function ChoiceOverlay({
  eyebrow,
  title,
  subtitle,
  returnLabel,
  footer,
  className,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  subtitle?: ReactNode;
  /** The toggle's words while the board is showing ("Back to the discard pile"). */
  returnLabel: string;
  footer?: ReactNode;
  /** Panel width, e.g. `max-w-lg`. */
  className?: string;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  return (
    <BoardOverlay
      hideLabel="Peek at the board"
      hideIcon="◐"
      showLabel={returnLabel}
      showIcon="↩"
      backdropClassName="bg-surface-950/70"
      toggleClassName="border-amber-200/60 bg-amber-700/90 shadow-glow-amber hover:bg-amber-600"
    >
      <motion.section
        role="dialog"
        aria-modal="false"
        aria-label={typeof title === "string" ? title : eyebrow}
        initial={reduced ? false : { opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        style={{ maxHeight: "88%" }}
        className={cn(
          "flex w-full flex-col overflow-hidden rounded-card-2xl bg-surface-900/95 shadow-2xl ring-1 ring-amber-200/15",
          className,
        )}
      >
        <header className="flex flex-col gap-1 border-b border-line-soft px-6 pb-4 pt-5">
          <Eyebrow size="sm">{eyebrow}</Eyebrow>
          <h2 className="font-fantasy text-2xl font-bold text-fg-strong">{title}</h2>
          {subtitle && <p className="text-sm text-fg-secondary">{subtitle}</p>}
          <p className="flex items-center gap-1.5 text-2xs text-fg-muted">
            Need to look at the table first? <Kbd>Esc</Kbd> or “Peek at the board” hides this until
            you come back.
          </p>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-line-soft bg-surface-950/40 px-6 py-3">
            {footer}
          </footer>
        )}
      </motion.section>
    </BoardOverlay>
  );
}
