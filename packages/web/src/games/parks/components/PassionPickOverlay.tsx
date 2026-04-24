import type { PassionId } from "@boardgames/core/games/parks/types";
import { PASSION_DESCRIPTIONS, PASSION_LABELS } from "@boardgames/core/games/parks/types";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { createPortal } from "react-dom";
import { getPassionImageUrl } from "../passion-images";

interface PassionPickOverlayProps {
  options: PassionId[];
  onPick: (id: PassionId) => void;
}

function PassionCard({ id, onPick }: { id: PassionId; onPick: (id: PassionId) => void }) {
  const url = getPassionImageUrl(id);
  return (
    <motion.button
      type="button"
      onClick={() => onPick(id)}
      whileHover={{ scale: 1.03, y: -4 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 320, damping: 22 }}
      className="group relative flex aspect-video w-[28rem] flex-col overflow-hidden rounded-2xl border-2 border-violet-400/30 bg-gradient-to-br from-stone-800 to-stone-900 text-left shadow-2xl ring-0 transition hover:border-violet-300/80 hover:ring-4 hover:ring-violet-400/40 focus:outline-none focus:ring-4 focus:ring-violet-300/60 sm:w-[32rem] lg:w-[36rem]"
    >
      {url ? (
        <img
          src={url}
          alt={PASSION_LABELS[id]}
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-violet-900 via-stone-800 to-emerald-900 text-5xl text-violet-200/60">
          {"\uD83C\uDFDE\uFE0F"}
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-gradient-to-t from-stone-950/95 via-stone-950/80 to-transparent p-4 pt-12">
        <span className="text-xl font-bold text-white drop-shadow">{PASSION_LABELS[id]}</span>
        <span className="text-xs leading-snug text-stone-200/90">{PASSION_DESCRIPTIONS[id]}</span>
      </div>
    </motion.button>
  );
}

export default function PassionPickOverlay({ options, onPick }: PassionPickOverlayProps) {
  const [hidden, setHidden] = useState(false);

  // Render into <main> (not body) so the overlay sits below the sticky nav.
  // Main has `position: relative`, so absolute children fill exactly its bounds.
  const target = typeof document !== "undefined" ? document.getElementById("app-main") : null;
  if (!target) return null;
  return createPortal(
    <>
      <AnimatePresence>
        {!hidden && (
          <motion.div
            key="passion-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-6 bg-stone-950/85 px-4 backdrop-blur-md"
          >
            <motion.div
              initial={{ y: -10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.05 }}
              className="flex flex-col items-center gap-1 text-center"
            >
              <span className="text-xs font-bold uppercase tracking-[0.3em] text-violet-300">
                Choose Your Passion
              </span>
              <span className="text-sm text-stone-300">
                Scored at the end of the game — pick the path that fits your style.
              </span>
            </motion.div>
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 280, damping: 24, delay: 0.1 }}
              className="flex flex-wrap items-center justify-center gap-6"
            >
              {options.map((id) => (
                <PassionCard key={id} id={id} onPick={onPick} />
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Sibling of the overlay inside the same portal, with a higher z-index
          so it always sits above the backdrop. */}
      <button
        type="button"
        onClick={() => setHidden((h) => !h)}
        className="absolute right-4 top-4 z-50 flex items-center gap-2 rounded-full border-2 border-violet-200 bg-violet-600 px-4 py-2 text-xs font-bold text-white shadow-[0_0_24px_rgba(167,139,250,0.7)] transition hover:scale-105 hover:bg-violet-500"
        title={hidden ? "Show passion choices" : "Hide overlay to peek at the board"}
      >
        <span className="text-base leading-none">
          {hidden ? "\uD83D\uDC41\uFE0F" : "\uD83D\uDE48"}
        </span>
        <span>{hidden ? "Choose passion" : "Peek board"}</span>
      </button>
    </>,
    target,
  );
}
