import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { XIcon } from "../../../../components/icons";
import { Eyebrow, IconButton } from "../../../../components/ui";

// The wide-screen home of a moment's detail: a panel docked to the right
// edge of the viewport, over the river rather than beside it, so opening a
// moment never reflows the timeline. Unlike a Drawer it is not modal — no
// scrim, no scroll lock, no focus trap — so the focused pin stays visible
// and the member can scroll on or click the next pin while it is open.
// (Escape and ← / → are the view's own keys.)

type Props = {
  eyebrow: ReactNode;
  title: ReactNode;
  label: string;
  onClose: () => void;
  children: ReactNode;
};

export function TimelineInspector({ eyebrow, title, label, onClose, children }: Props) {
  const reduced = useReducedMotion();
  return (
    <motion.aside
      aria-label={label}
      className="fixed top-below-nav right-0 bottom-0 z-overlay flex w-[28rem] max-w-full flex-col border-l border-line bg-surface-950 shadow-2xl shadow-black/50"
      initial={reduced ? false : { x: 48, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 30 }}
    >
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line-soft px-5 py-4">
        <div className="min-w-0">
          <Eyebrow size="sm">{eyebrow}</Eyebrow>
          <h2 className="mt-1 truncate text-base font-semibold text-fg-strong">{title}</h2>
        </div>
        <IconButton
          variant="ghost"
          size="sm"
          aria-label="Close"
          onClick={onClose}
          icon={<XIcon />}
        />
      </header>
      <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
        {children}
      </div>
    </motion.aside>
  );
}
