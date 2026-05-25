import type { SkyTeamPlayerView } from "@boardgames/core/games/sky-team/types";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "../../../components/ui/Button";

interface Props {
  view: SkyTeamPlayerView;
  onReady: () => void;
}

function ReadyChip({
  label,
  ready,
  tone,
}: {
  label: string;
  ready: boolean;
  tone: "pilot" | "copilot";
}) {
  const labelColor = tone === "pilot" ? "text-sky-300" : "text-orange-300";
  return (
    <div className="flex flex-1 flex-col items-center gap-1.5">
      <span className={`text-[11px] font-bold uppercase tracking-wider ${labelColor}`}>
        {label}
      </span>
      <span
        className={[
          "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
          ready
            ? "bg-emerald-600/90 text-white shadow-[0_0_14px_rgba(16,185,129,0.5)]"
            : "bg-slate-700/80 text-slate-300",
        ].join(" ")}
      >
        <span className="text-[10px]">{ready ? "✓" : "•"}</span>
        {ready ? "Ready" : "Not ready"}
      </span>
    </div>
  );
}

/**
 * Briefing / discussion-phase overlay. Modelled on Parks' `PassionPickOverlay`:
 * portals over `#app-main` with a blurred backdrop so the cockpit stays mounted
 * underneath — the player never leaves the board. A "Peek board" toggle hides
 * the overlay entirely to study the board mid-discussion.
 */
export default function BriefingOverlay({ view, onReady }: Props) {
  const [hidden, setHidden] = useState(false);

  // Portal into <main> (not body) so the overlay sits below the sticky nav and
  // fills exactly the content area (main is position:relative).
  const target = typeof document !== "undefined" ? document.getElementById("app-main") : null;
  if (!target) return null;

  const myReady = view.readyForRoll[view.viewerIndex];
  const oppIdx = (1 - view.viewerIndex) as 0 | 1;
  const oppReady = view.readyForRoll[oppIdx];

  return createPortal(
    <>
      <AnimatePresence>
        {!hidden && (
          <motion.div
            key="briefing-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-md"
          >
            <motion.div
              initial={{ y: 18, opacity: 0, scale: 0.97 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 8, opacity: 0 }}
              transition={{ type: "spring", stiffness: 280, damping: 24, delay: 0.04 }}
              className="flex w-full max-w-md flex-col items-center gap-5 rounded-2xl border-2 border-amber-500/50 bg-slate-900 p-7 text-center shadow-2xl ring-1 ring-black/40"
            >
              <div className="flex flex-col items-center gap-1">
                <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-amber-300">
                  Briefing
                </span>
                <h2 className="text-2xl font-black text-white">
                  Round {view.round}{" "}
                  <span className="text-lg font-bold text-slate-400">
                    of {view.scenario.totalRounds}
                  </span>
                </h2>
              </div>

              <p className="text-sm leading-relaxed text-slate-300">
                Discuss your plan freely now. Once you're ready the dice roll, and you must stay{" "}
                <strong className="text-amber-200">silent about specific dice values</strong> for
                the rest of the round.
              </p>

              <div className="flex w-full items-stretch justify-center gap-3">
                <ReadyChip label="Pilot" ready={view.readyForRoll[0]} tone="pilot" />
                <ReadyChip label="Co-Pilot" ready={view.readyForRoll[1]} tone="copilot" />
              </div>

              <Button
                variant="primary"
                size="lg"
                disabled={myReady}
                onClick={onReady}
                className="w-full"
              >
                {myReady ? (oppReady ? "Rolling…" : "Waiting for partner…") : "Ready to roll"}
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating peek toggle — always above the backdrop so the player can
          drop the overlay to study the board mid-briefing, then bring it back. */}
      {/* biome-ignore lint/correctness/noRestrictedElements: bespoke floating overlay toggle with portal/z-index chrome */}
      <button
        type="button"
        onClick={() => setHidden((h) => !h)}
        className="absolute right-4 top-4 z-50 flex items-center gap-2 rounded-full border-2 border-amber-300 bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-[0_0_24px_rgba(245,158,11,0.6)] transition hover:scale-105 hover:bg-amber-500"
        title={hidden ? "Show the briefing" : "Hide overlay to study the board"}
      >
        <span className="text-base leading-none">{hidden ? "📋" : "🙈"}</span>
        <span>{hidden ? "Briefing" : "Peek board"}</span>
      </button>
    </>,
    target,
  );
}
