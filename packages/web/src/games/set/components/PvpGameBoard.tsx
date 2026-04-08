import type { PvpGameEvent, SetPvpPlayerView } from "@boardgames/core/games/set/pvp-machine";
import type { PlayerId } from "@boardgames/core/games/set/pvp-types";
import { useEffect } from "react";
import CardGrid from "./CardGrid";
import SelectionTimer from "./SelectionTimer";
import type { SelectionColor } from "./SetCard";

interface PvpGameBoardProps {
  view: SetPvpPlayerView;
  playerIndex: number;
  opponentName: string;
  send: (action: PvpGameEvent) => void;
}

export default function PvpGameBoard({ view, playerIndex, opponentName, send }: PvpGameBoardProps) {
  const me = playerIndex as PlayerId;
  const opp = (1 - playerIndex) as PlayerId;
  const myState = view.players[me];
  const oppState = view.players[opp];

  const isSelecting = view.activePlayer !== null;
  const iAmSelecting = view.activePlayer === me;
  const oppIsSelecting = view.activePlayer === opp;
  const canCallSet = !isSelecting;

  // Keyboard: Space or S to call SET
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.key === " " || e.key === "s" || e.key === "S") && canCallSet) {
        e.preventDefault();
        send({ type: "CALL_SET", playerIndex: me });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [canCallSet, send, me]);

  // Lock scroll
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = "";
      body.style.overflow = "";
    };
  }, []);

  const selectionColor: SelectionColor = iAmSelecting ? "yellow" : "emerald";

  return (
    <div className="flex h-[calc(100dvh-45px)] overflow-hidden">
      {/* Center — card grid */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col p-2 gap-2">
        {/* Opponent bar */}
        <div
          className={`flex items-center justify-between rounded-lg px-4 py-2 shrink-0 ${
            oppIsSelecting ? "bg-emerald-900/30 border border-emerald-500/40" : "bg-gray-800/60"
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-gray-300">{opponentName}</span>
            {oppIsSelecting && (
              <span className="text-xs font-semibold text-emerald-400 animate-pulse">
                Selecting...
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-green-400 font-bold">{oppState.score} SETs</span>
            <span className="text-red-400 font-bold">{oppState.penalties} Pen</span>
            <span className="text-gray-400 font-semibold">
              Net {oppState.score - oppState.penalties}
            </span>
          </div>
        </div>

        {/* Timer bar (shown when anyone is selecting) */}
        {isSelecting && view.selectionDeadline > 0 && (
          <div className="shrink-0">
            <SelectionTimer deadline={view.selectionDeadline} />
          </div>
        )}

        {/* Message */}
        {view.message && (
          <div className="shrink-0 text-center">
            <p
              className={`text-xs font-semibold ${
                view.message.includes("found") ? "text-green-400" : "text-red-400"
              }`}
            >
              {view.message}
            </p>
          </div>
        )}

        {/* Card grid */}
        <div className="flex-1 min-h-0">
          <CardGrid
            slots={view.slots}
            selected={view.selected}
            onToggle={(id) => send({ type: "SELECT_CARD", cardId: id, playerIndex: me })}
            disabled={!iAmSelecting}
            hintedCardId={null}
            selectionColor={selectionColor}
          />
        </div>
      </div>

      {/* Right sidebar — your stats & SET button */}
      <div className="flex flex-col gap-3 px-5 py-4 shrink-0 w-44 border-l border-gray-800">
        <p className="text-xs text-gray-500 uppercase tracking-wide">You</p>
        <StatRow label="SETs" value={String(myState.score)} color="text-green-400" />
        <StatRow label="Penalties" value={String(myState.penalties)} color="text-red-400" />
        <StatRow label="Net" value={String(myState.score - myState.penalties)} />
        <StatRow label="Deck" value={String(view.deckRemaining)} color="text-gray-500" />

        {iAmSelecting && (
          <div className="pt-3 border-t border-gray-800">
            <p className="text-xs text-yellow-300 font-semibold leading-snug">Select 3 cards</p>
          </div>
        )}

        <div className="flex-1" />

        <button
          type="button"
          onClick={() => send({ type: "CALL_SET", playerIndex: me })}
          disabled={!canCallSet}
          className={[
            "rounded-xl px-5 py-3 text-lg font-extrabold tracking-wider text-white transition-all duration-200 w-full",
            canCallSet
              ? "bg-indigo-600 hover:bg-indigo-500 active:scale-95 cursor-pointer"
              : "bg-gray-700 opacity-40 cursor-not-allowed",
          ].join(" ")}
        >
          SET!
        </button>

        <p className="text-center text-[10px] text-gray-600">
          or press{" "}
          <kbd className="rounded bg-gray-700 px-1.5 py-0.5 font-mono text-gray-400">Space</kbd>
        </p>
      </div>
    </div>
  );
}

function StatRow({
  label,
  value,
  color = "text-white",
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-gray-500 uppercase tracking-wide">{label}</span>
      <span className={`text-base font-bold tabular-nums ${color}`}>{value}</span>
    </div>
  );
}
