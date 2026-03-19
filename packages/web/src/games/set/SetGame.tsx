import { setGameMachine } from "@boardgames/core/games/set/machine";
import { formatTime } from "@boardgames/core/games/set/metrics";
import type { GamePhase } from "@boardgames/core/games/set/types";
import { useEffect, useRef, useState } from "react";
import type { SnapshotFrom } from "xstate";
import useDocumentTitle from "../../hooks/useDocumentTitle";
import { useLocalGame } from "../../hooks/useLocalGame";
import CardGrid from "./components/CardGrid";
import GameOverScreen from "./components/GameOverScreen";
import HighScores from "./components/HighScores";
import LiveMetrics from "./components/LiveMetrics";
import SetupScreen from "./components/SetupScreen";
import { useSetHistory } from "./hooks/useSetHistory";

function toGamePhase(state: SnapshotFrom<typeof setGameMachine>): GamePhase {
  if (state.matches("idle")) return "idle";
  if (state.matches("dealing")) return "dealing";
  if (state.matches("playing")) return "playing";
  if (state.matches("selecting")) return "selecting";
  if (state.matches("gameOver")) return "game-over";
  return "idle";
}

function useElapsedTime(phase: GamePhase, startTime: number) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (phase === "idle" || phase === "game-over" || startTime === 0) return;
    const tick = () => setElapsed(Date.now() - startTime);
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [phase, startTime]);
  return elapsed;
}

export default function SetGame() {
  useDocumentTitle("Set - Board Games");

  const { snapshot: state, send } = useLocalGame(setGameMachine);
  const ctx = state.context;
  const phase = toGamePhase(state);
  const elapsed = useElapsedTime(phase, ctx.gameStartTime);

  const { history, save, clear } = useSetHistory();
  const savedRef = useRef(new Set<string>());

  const [showHighScores, setShowHighScores] = useState(false);

  const canCallSet = state.matches({ dealing: "active" }) || state.matches("playing");
  const isActive = !state.matches("idle") && !state.matches("gameOver");

  useEffect(() => {
    if (state.matches("gameOver") && ctx.gameRecord && !savedRef.current.has(ctx.gameRecord.id)) {
      savedRef.current.add(ctx.gameRecord.id);
      save(ctx.gameRecord);
    }
  }, [state.matches, ctx.gameRecord, save]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.key === " " || e.key === "s" || e.key === "S") && canCallSet) {
        e.preventDefault();
        send({ type: "CALL_SET" });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [canCallSet, send]);

  useEffect(() => {
    if (!isActive) return;
    const html = document.documentElement;
    const body = document.body;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = "";
      body.style.overflow = "";
    };
  }, [isActive]);

  if (showHighScores) {
    return (
      <div className="mx-auto max-w-3xl px-6">
        <HighScores history={history} onClear={clear} onBack={() => setShowHighScores(false)} />
      </div>
    );
  }

  if (state.matches("idle")) {
    return (
      <SetupScreen
        onStart={() => send({ type: "START_GAME" })}
        onViewHighScores={() => setShowHighScores(true)}
      />
    );
  }

  if (state.matches("gameOver") && ctx.gameRecord) {
    return (
      <div className="mx-auto max-w-3xl px-6">
        <GameOverScreen
          record={ctx.gameRecord}
          history={history}
          onPlayAgain={() => send({ type: "START_GAME" })}
          onViewHighScores={() => setShowHighScores(true)}
        />
      </div>
    );
  }

  const message = ctx.message;
  const isSelecting = state.matches("selecting");

  return (
    <div className="flex h-[calc(100dvh-45px)] overflow-hidden">
      {/* Center — card grid */}
      <div className="flex-1 min-h-0 min-w-0 p-2">
        <CardGrid
          slots={ctx.slots}
          selected={ctx.selected}
          onToggle={(id) => send({ type: "SELECT_CARD", cardId: id })}
          disabled={state.matches("dealing")}
          hintedCardId={ctx.hintedCardId}
        />
      </div>

      {/* Right sidebar — stats, actions & metrics */}
      <div className="flex flex-col gap-3 px-5 py-4 shrink-0 w-44 border-l border-gray-800">
        <StatRow label="Time" value={formatTime(elapsed)} mono />
        <StatRow label="SETs" value={String(ctx.score)} color="text-green-400" />
        <StatRow label="Penalties" value={String(ctx.penalties)} color="text-red-400" />
        <StatRow label="Net" value={String(ctx.score - ctx.penalties)} />
        <StatRow label="Deck" value={String(ctx.deck.length)} color="text-gray-500" />

        {(isSelecting || message) && (
          <div className="pt-3 border-t border-gray-800">
            {isSelecting ? (
              <p className="text-xs text-yellow-300 font-semibold leading-snug">Select 3 cards</p>
            ) : message ? (
              <p
                className={`text-xs font-semibold leading-snug ${
                  message.startsWith("Valid")
                    ? "text-green-400"
                    : message.startsWith("Hint")
                      ? "text-amber-400"
                      : "text-red-400"
                }`}
              >
                {message}
              </p>
            ) : null}
          </div>
        )}

        <div className="flex-1" />

        {isActive && ctx.perSetRecords.length > 0 && (
          <LiveMetrics
            perSetRecords={ctx.perSetRecords}
            gameStartTime={ctx.gameStartTime}
            score={ctx.score}
            earlyCallCount={ctx.perSetRecords.filter((r) => r.calledDuringDeal).length}
          />
        )}

        <div className="flex flex-col gap-2 pt-3 border-t border-gray-800">
          <button
            type="button"
            onClick={() => send({ type: "PLUS_THREE" })}
            disabled={!(state.matches("playing") && ctx.deck.length >= 3)}
            className="rounded-lg bg-gray-700 px-3 py-2 text-xs text-white transition hover:bg-gray-600 disabled:opacity-40 w-full text-center"
          >
            +3 Cards
          </button>
          <button
            type="button"
            onClick={() => send({ type: "USE_HINT" })}
            disabled={!state.matches("playing")}
            className="rounded-lg bg-amber-700 px-3 py-2 text-xs text-white transition hover:bg-amber-600 disabled:opacity-40 w-full text-center"
            title="Highlights one card from a valid SET (costs 3 penalties)"
          >
            Hint
          </button>
          <button
            type="button"
            onClick={() => send({ type: "START_GAME" })}
            className="rounded-lg bg-gray-700 px-3 py-2 text-xs text-white transition hover:bg-gray-600 w-full text-center"
          >
            New Game
          </button>
        </div>
      </div>
    </div>
  );
}

function StatRow({
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
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-gray-500 uppercase tracking-wide">{label}</span>
      <span className={`text-base font-bold tabular-nums ${color} ${mono ? "font-mono" : ""}`}>
        {value}
      </span>
    </div>
  );
}
