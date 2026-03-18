import { useMachine } from "@xstate/react";
import { useEffect, useState } from "react";
import type { SnapshotFrom } from "xstate";
import useDocumentTitle from "../../hooks/useDocumentTitle";
import CardGrid from "./components/CardGrid";
import GameHeader from "./components/GameHeader";
import GameOverScreen from "./components/GameOverScreen";
import HighScores from "./components/HighScores";
import LiveMetrics from "./components/LiveMetrics";
import SetCallButton from "./components/SetCallButton";
import { setGameMachine } from "./logic/machine";
import type { GamePhase } from "./logic/types";

function toGamePhase(state: SnapshotFrom<typeof setGameMachine>): GamePhase {
  if (state.matches("idle")) return "idle";
  if (state.matches("dealing")) return "dealing";
  if (state.matches("playing")) return "playing";
  if (state.matches("selecting")) return "selecting";
  if (state.matches("gameOver")) return "game-over";
  return "idle";
}

export default function SetGame() {
  useDocumentTitle("Set - Board Games");

  const [state, send] = useMachine(setGameMachine);
  const ctx = state.context;
  const phase = toGamePhase(state);

  const [showHighScores, setShowHighScores] = useState(false);

  const canCallSet = state.matches({ dealing: "active" }) || state.matches("playing");

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

  if (showHighScores) {
    return (
      <div className="mx-auto max-w-3xl px-6">
        <HighScores onBack={() => setShowHighScores(false)} />
      </div>
    );
  }

  if (state.matches("idle")) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-6">
        <h2 className="text-4xl font-extrabold text-white">Set</h2>
        <p className="max-w-md text-center text-gray-400">
          Find groups of three cards where each attribute (shape, color, fill, count) is either all
          the same or all different across the three cards.
        </p>
        <p className="text-sm text-gray-500">
          Cards are dealt one-by-one. Press{" "}
          <kbd className="rounded bg-gray-700 px-2 py-0.5 text-xs font-mono text-gray-300">
            Space
          </kbd>{" "}
          or the SET! button anytime you spot one — even mid-deal.
        </p>
        <button
          type="button"
          onClick={() => send({ type: "START_GAME" })}
          className="rounded-xl bg-indigo-600 px-8 py-3 font-semibold text-white transition hover:bg-indigo-500"
        >
          Start Game
        </button>
        <button
          type="button"
          onClick={() => setShowHighScores(true)}
          className="text-sm text-gray-500 transition hover:text-gray-300"
        >
          View High Scores
        </button>
      </div>
    );
  }

  if (state.matches("gameOver") && ctx.gameRecord) {
    return (
      <div className="mx-auto max-w-3xl px-6">
        <GameOverScreen
          record={ctx.gameRecord}
          onPlayAgain={() => send({ type: "START_GAME" })}
          onViewHighScores={() => setShowHighScores(true)}
        />
      </div>
    );
  }

  const isActive = !state.matches("idle") && !state.matches("gameOver");

  return (
    <div className="mx-auto max-w-4xl px-6 py-6">
      <GameHeader
        phase={phase}
        gameStartTime={ctx.gameStartTime}
        score={ctx.score}
        penalties={ctx.penalties}
        deckRemaining={ctx.deck.length}
        onNewGame={() => send({ type: "START_GAME" })}
        onPlusThree={() => send({ type: "PLUS_THREE" })}
        plusThreeEnabled={state.matches("playing") && ctx.deck.length >= 3}
        onHint={() => send({ type: "USE_HINT" })}
        hintEnabled={state.matches("playing")}
      />

      {ctx.message && (
        <p
          className={`mb-4 text-center text-sm font-semibold ${
            ctx.message.startsWith("Valid")
              ? "text-green-400"
              : ctx.message.startsWith("Hint")
                ? "text-amber-400"
                : "text-red-400"
          }`}
        >
          {ctx.message}
        </p>
      )}

      {state.matches("selecting") && (
        <p className="mb-3 text-center text-sm text-yellow-300">
          Select 3 cards to complete the SET
        </p>
      )}

      <CardGrid
        slots={ctx.slots}
        selected={ctx.selected}
        onToggle={(id) => send({ type: "SELECT_CARD", cardId: id })}
        disabled={state.matches("dealing")}
        hintedCardId={ctx.hintedCardId}
      />

      <div className="mt-6 flex flex-col items-center gap-4">
        <SetCallButton onClick={() => send({ type: "CALL_SET" })} disabled={!canCallSet} />

        {isActive && ctx.perSetRecords.length > 0 && (
          <LiveMetrics
            perSetRecords={ctx.perSetRecords}
            gameStartTime={ctx.gameStartTime}
            score={ctx.score}
            earlyCallCount={ctx.perSetRecords.filter((r) => r.calledDuringDeal).length}
          />
        )}
      </div>
    </div>
  );
}
