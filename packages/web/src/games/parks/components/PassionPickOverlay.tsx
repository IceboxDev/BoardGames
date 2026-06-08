import type { PassionId } from "@boardgames/core/games/parks/types";
import { PASSION_DESCRIPTIONS, PASSION_LABELS } from "@boardgames/core/games/parks/types";
import { motion } from "framer-motion";
import { BoardOverlay } from "../../../components/ui";
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
          {"🏞️"}
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
  return (
    <BoardOverlay
      hideLabel="Peek board"
      hideIcon={"🙈"}
      showLabel="Choose passion"
      showIcon={"👁️"}
      backdropClassName="bg-stone-950/85"
      toggleClassName="border-violet-200 bg-violet-600 shadow-[0_0_24px_rgba(167,139,250,0.7)] hover:bg-violet-500"
    >
      <div className="flex flex-col items-center justify-center gap-6">
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
      </div>
    </BoardOverlay>
  );
}
