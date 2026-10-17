import type { BotcView } from "@boardgames/core/games/blood-on-the-clocktower/online/view";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { cn } from "../../../../lib/cn";
import { type Announcement, announcementOf } from "../day-parts";

/** How long an announcement stays up — shorter once a vote is on, whose panel it covers. */
const SHOW_MS = 2800;
const VOTE_SHOW_MS = 1800;

const TONE: Record<Announcement["tone"], string> = {
  night: "border-purple-300/40 bg-purple-950/90",
  day: "border-amber-300/40 bg-surface-900/90",
  vote: "border-sky-300/40 bg-surface-900/90",
  grave: "border-rose-400/40 bg-surface-950/90",
  end: "border-amber-300/50 bg-surface-950/90",
};

/**
 * A card across the square whenever the game enters a new part — "Night 2",
 * "Day 2: Ada died in the night", "Ada nominates Basil", the count — held
 * long enough to read, then gone. It never takes a click.
 */
export function PhaseBanner({ view }: { view: BotcView }) {
  const next = announcementOf(view);
  const [shown, setShown] = useState<Announcement | null>(null);
  const key = next?.key ?? null;

  // A new key raises the card; the timer belongs to that key alone. The
  // announcement is read through `key`, so a re-render with the same key
  // (a chat line) neither restarts nor lowers it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the announcement's key only
  useEffect(() => {
    if (!next) return;
    setShown(next);
    const id = setTimeout(
      () => setShown(null),
      next.key.startsWith("voting:") || next.key.startsWith("defence:") ? VOTE_SHOW_MS : SHOW_MS,
    );
    return () => clearTimeout(id);
  }, [key]);

  return (
    <div className="pointer-events-none absolute inset-0 z-raised flex items-center justify-center p-4">
      <AnimatePresence>
        {shown && (
          <motion.div
            key={shown.key}
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, scale: 0.92, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -8 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className={cn(
              "flex max-w-md flex-col items-center gap-2 rounded-card-2xl border px-8 py-6 text-center shadow-2xl backdrop-blur",
              TONE[shown.tone],
            )}
          >
            <span aria-hidden className="text-5xl">
              {shown.icon}
            </span>
            <span className="text-3xl font-black text-fg-strong">{shown.title}</span>
            <span className="text-base text-fg-secondary">{shown.detail}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
