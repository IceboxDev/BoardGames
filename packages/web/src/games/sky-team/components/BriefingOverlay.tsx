import type { SkyTeamPlayerView } from "@boardgames/core/games/sky-team/types";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { BoardOverlay } from "../../../components/ui";
import { Button } from "../../../components/ui/Button";
import type { ChatMessage } from "../../../lib/ws-client";

interface Props {
  view: SkyTeamPlayerView;
  onReady: () => void;
  /** Chat log + sender for MP rooms. Omit in solo (chat is N/A). */
  chat?: {
    messages: ChatMessage[];
    onSend: (text: string) => void;
    mySlot: number;
  };
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
      <span className={`text-2xs font-bold uppercase tracking-wider ${labelColor}`}>{label}</span>
      <span
        className={[
          "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
          ready
            ? "bg-emerald-600/90 text-white shadow-[0_0_14px_rgba(16,185,129,0.5)]"
            : "bg-surface-700/80 text-fg-secondary",
        ].join(" ")}
      >
        <span className="text-3xs">{ready ? "✓" : "•"}</span>
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
export default function BriefingOverlay({ view, onReady, chat }: Props) {
  const myReady = view.readyForRoll[view.viewerIndex];
  const oppIdx = (1 - view.viewerIndex) as 0 | 1;
  const oppReady = view.readyForRoll[oppIdx];

  return (
    <BoardOverlay
      hideLabel="Peek board"
      hideIcon="🙈"
      showLabel="Briefing"
      showIcon="📋"
      backdropClassName="bg-surface-950/70"
      toggleClassName="border-amber-300 bg-amber-600 shadow-[0_0_24px_rgba(245,158,11,0.6)] hover:bg-amber-500"
    >
      <motion.div
        initial={{ y: 18, opacity: 0, scale: 0.97 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 280, damping: 24, delay: 0.04 }}
        className={`flex w-full ${chat ? "max-w-lg" : "max-w-md"} flex-col items-center gap-5 rounded-2xl border-2 border-amber-500/50 bg-surface-900 p-7 text-center shadow-2xl ring-1 ring-black/40`}
      >
        <div className="flex flex-col items-center gap-1">
          <span className="text-2xs font-bold uppercase tracking-[0.3em] text-amber-300">
            Briefing
          </span>
          <h2 className="text-2xl font-black text-white">
            {view.isFinalRound ? (
              "Final Approach"
            ) : (
              <>
                Round {view.round}{" "}
                <span className="text-lg font-bold text-fg-secondary">
                  of {view.scenario.totalRounds}
                </span>
              </>
            )}
          </h2>
        </div>

        <p className="text-sm leading-relaxed text-fg-secondary">
          Discuss your plan freely now. Once you're ready the dice roll, and you must stay{" "}
          <strong className="text-amber-200">silent about specific dice values</strong> for the rest
          of the round.
        </p>

        {chat && <ChatPanel messages={chat.messages} onSend={chat.onSend} mySlot={chat.mySlot} />}

        <div className="flex w-full items-stretch justify-center gap-3">
          <ReadyChip label="Pilot" ready={view.readyForRoll[0]} tone="pilot" />
          <ReadyChip label="Co-Pilot" ready={view.readyForRoll[1]} tone="copilot" />
        </div>

        <Button variant="primary" size="lg" disabled={myReady} onClick={onReady} block>
          {myReady ? (oppReady ? "Rolling…" : "Waiting for partner…") : "Ready to roll"}
        </Button>
      </motion.div>
    </BoardOverlay>
  );
}

/**
 * Briefing chat. Auto-scrolls to the latest message and lets the player
 * send up to 500 chars with Enter. Rendered only in MP (solo never
 * mounts this overlay).
 */
function ChatPanel({
  messages,
  onSend,
  mySlot,
}: {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  mySlot: number;
}) {
  const [draft, setDraft] = useState("");
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [messages]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
  };

  return (
    <div className="flex w-full flex-col gap-2 rounded-xl border border-white/10 bg-surface-950/40 p-3 text-left">
      <span className="text-3xs font-bold uppercase tracking-[0.25em] text-fg-secondary">
        Crew Chat
      </span>
      <div
        ref={logRef}
        className="flex h-40 flex-col gap-1.5 overflow-y-auto rounded-lg bg-surface-950/60 p-2 text-xs"
      >
        {messages.length === 0 ? (
          <span className="my-auto text-center text-2xs italic text-fg-disabled">
            No messages yet — start the briefing.
          </span>
        ) : (
          messages.map((m) => {
            const isMine = m.fromSlot === mySlot;
            return (
              <div
                key={`${m.fromSlot}-${m.timestampMs}`}
                className={`flex flex-col ${isMine ? "items-end" : "items-start"}`}
              >
                <span className="text-[9px] uppercase tracking-wider text-fg-muted">
                  {m.fromName}
                </span>
                <span
                  className={`max-w-[90%] break-words rounded-lg px-2 py-1 text-2xs leading-snug ${
                    isMine
                      ? "bg-amber-500/15 text-amber-100 ring-1 ring-inset ring-amber-400/30"
                      : "bg-surface-800/80 text-fg-primary ring-1 ring-inset ring-white/10"
                  }`}
                >
                  {m.text}
                </span>
              </div>
            );
          })
        )}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Discuss your plan…"
          maxLength={500}
          className="flex-1 rounded-md border border-white/10 bg-surface-900 px-2.5 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-amber-400/60 focus:ring-1 focus:ring-amber-400/30"
        />
        <Button variant="secondary" size="xs" onClick={send} disabled={!draft.trim()}>
          Send
        </Button>
      </div>
    </div>
  );
}
