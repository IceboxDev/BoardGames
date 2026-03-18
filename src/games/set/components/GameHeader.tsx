import { useEffect, useState } from "react";
import { formatTime } from "../logic/metrics";
import type { GamePhase } from "../logic/types";

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
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-6">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Time</p>
          <p className="text-2xl font-mono font-bold text-white tabular-nums">
            {formatTime(elapsed)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">SETs</p>
          <p className="text-2xl font-bold text-green-400">{score}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Penalties</p>
          <p className="text-2xl font-bold text-red-400">{penalties}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Net</p>
          <p className="text-2xl font-bold text-white">{score - penalties}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Deck</p>
          <p className="text-2xl font-bold text-gray-400">{deckRemaining}</p>
        </div>
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onPlusThree}
          disabled={!plusThreeEnabled}
          className="rounded-lg bg-gray-700 px-4 py-2 text-sm text-white transition hover:bg-gray-600 disabled:opacity-40"
        >
          +3 Cards
        </button>
        <button
          type="button"
          onClick={onHint}
          disabled={!hintEnabled}
          className="rounded-lg bg-amber-700 px-4 py-2 text-sm text-white transition hover:bg-amber-600 disabled:opacity-40"
          title="Highlights one card from a valid SET (costs 3 penalties)"
        >
          Hint
        </button>
        <button
          type="button"
          onClick={onNewGame}
          className="rounded-lg bg-gray-700 px-4 py-2 text-sm text-white transition hover:bg-gray-600"
        >
          New Game
        </button>
      </div>
    </div>
  );
}
