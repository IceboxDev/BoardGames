import { formatTime } from "@boardgames/core/games/set/metrics";
import type { GamePhase } from "@boardgames/core/games/set/types";
import { useEffect, useState } from "react";

interface GameHeaderProps {
  phase: GamePhase;
  gameStartTime: number;
  score: number;
  penalties: number;
  deckRemaining: number;
  onNewGame: () => void;
  onPlusThree: () => void;
  plusThreeEnabled: boolean;
  onHint: () => void;
  hintEnabled: boolean;
  onCallSet: () => void;
  callSetEnabled: boolean;
  isSelecting: boolean;
  message: string;
}

function messageColor(message: string): string {
  if (message.startsWith("Valid")) return "text-green-400";
  if (message.startsWith("Hint")) return "text-amber-400";
  return "text-red-400";
}

export default function GameHeader({
  phase,
  gameStartTime,
  score,
  penalties,
  deckRemaining,
  onNewGame,
  onPlusThree,
  plusThreeEnabled,
  onHint,
  hintEnabled,
  onCallSet,
  callSetEnabled,
  isSelecting,
  message,
}: GameHeaderProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (phase === "idle" || phase === "game-over" || gameStartTime === 0) return;
    const tick = () => setElapsed(Date.now() - gameStartTime);
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [phase, gameStartTime]);

  return (
    <div className="flex items-center gap-3 px-3 py-2 shrink-0">
      <button
        type="button"
        onClick={onCallSet}
        disabled={!callSetEnabled}
        className={[
          "rounded-xl px-5 py-2 text-base font-extrabold tracking-wider text-white transition-all duration-200 shrink-0",
          callSetEnabled
            ? "bg-indigo-600 hover:bg-indigo-500 active:scale-95 animate-pulse-glow cursor-pointer"
            : "bg-gray-700 opacity-40 cursor-not-allowed",
        ].join(" ")}
      >
        SET!
      </button>

      <div className="flex items-center gap-4 text-sm shrink-0">
        <Stat label="Time" value={formatTime(elapsed)} mono />
        <Stat label="SETs" value={String(score)} color="text-green-400" />
        <Stat label="Pen" value={String(penalties)} color="text-red-400" />
        <Stat label="Net" value={String(score - penalties)} />
        <Stat label="Deck" value={String(deckRemaining)} color="text-gray-500" />
      </div>

      <div className="flex-1 min-w-0 text-center text-xs font-semibold truncate">
        {isSelecting ? (
          <span className="text-yellow-300">Select 3 cards to complete the SET</span>
        ) : message ? (
          <span className={messageColor(message)}>{message}</span>
        ) : null}
      </div>

      <div className="flex gap-2 shrink-0">
        <button
          type="button"
          onClick={onPlusThree}
          disabled={!plusThreeEnabled}
          className="rounded-lg bg-gray-700 px-3 py-1.5 text-xs text-white transition hover:bg-gray-600 disabled:opacity-40"
        >
          +3
        </button>
        <button
          type="button"
          onClick={onHint}
          disabled={!hintEnabled}
          className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs text-white transition hover:bg-amber-600 disabled:opacity-40"
          title="Highlights one card from a valid SET (costs 3 penalties)"
        >
          Hint
        </button>
        <button
          type="button"
          onClick={onNewGame}
          className="rounded-lg bg-gray-700 px-3 py-1.5 text-xs text-white transition hover:bg-gray-600"
        >
          New
        </button>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  color = "text-white",
  mono,
}: {
  label: string;
  value: string;
  color?: string;
  mono?: boolean;
}) {
  return (
    <div className="text-center leading-tight">
      <p className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-sm font-bold tabular-nums ${color} ${mono ? "font-mono" : ""}`}>
        {value}
      </p>
    </div>
  );
}
