import type { EKGameReplayLog } from "@boardgames/core/games/exploding-kittens/replay-log";
import { snapshotToGameState } from "@boardgames/core/games/exploding-kittens/replay-log";
import type { ActionLogEntry, GameState } from "@boardgames/core/games/exploding-kittens/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GameBoard from "./GameBoard";

interface GameReplayProps {
  game: EKGameReplayLog;
}

function OldFormatNotice() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <p className="text-sm text-gray-400">
        This replay was saved in an older format and cannot be played back.
      </p>
    </div>
  );
}

export default function GameReplay({ game }: GameReplayProps) {
  const hasData = !!game.steps?.length && !!game.strategies;
  const steps = hasData ? game.steps : [];

  const strategies = game.strategies ?? [];

  const playerTypes = useMemo(
    () => strategies.map((s) => (s === null ? "human" : ("ai" as const))),
    [strategies],
  );

  const gameStates = useMemo(
    () => steps.map((step) => snapshotToGameState(step.state, playerTypes, strategies)),
    [steps, playerTypes, strategies],
  );

  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(500);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    setPlaying(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const play = useCallback(() => {
    if (stepIndex >= steps.length - 1) return;
    setPlaying(true);
  }, [stepIndex, steps.length]);

  useEffect(() => {
    if (!playing) return;
    intervalRef.current = setInterval(() => {
      setStepIndex((prev) => {
        if (prev >= steps.length - 1) {
          stop();
          return prev;
        }
        return prev + 1;
      });
    }, speed);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [playing, speed, steps.length, stop]);

  const goTo = (idx: number) => {
    stop();
    setStepIndex(Math.max(0, Math.min(idx, steps.length - 1)));
  };

  const currentStep = steps[stepIndex];
  const boardState = gameStates[stepIndex];

  // Build actionLog up to the current step's turnCount
  const visibleActionLog = useMemo(() => {
    if (!game.actionLog?.length || !boardState) return [];
    const maxTurn = boardState.turnCount;
    return game.actionLog.filter((e: ActionLogEntry) => e.turn <= maxTurn);
  }, [game.actionLog, boardState]);

  const boardStateWithLog: GameState | null = useMemo(
    () => (boardState ? { ...boardState, actionLog: visibleActionLog } : null),
    [boardState, visibleActionLog],
  );

  if (!hasData || !boardStateWithLog || !currentStep) {
    return <OldFormatNotice />;
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1">
        <GameBoard state={boardStateWithLog} replayMode stepDescription={currentStep.description} />
      </div>

      <div className="shrink-0 border-t border-gray-800/50 bg-gray-900/80 px-4 py-3">
        <p
          className="mb-2 text-center text-xs text-gray-400 truncate"
          title={currentStep.description}
        >
          {currentStep.description}
        </p>

        <div className="flex items-center justify-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => goTo(0)}
            disabled={stepIndex === 0}
            className="px-2 py-1 text-xs text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
            title="First"
          >
            {"<<"}
          </button>

          <button
            type="button"
            onClick={() => goTo(stepIndex - 1)}
            disabled={stepIndex === 0}
            className="rounded-md border border-gray-700 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-gray-800 disabled:opacity-30"
          >
            Prev
          </button>

          {playing ? (
            <button
              type="button"
              onClick={stop}
              className="rounded-md bg-red-600/80 px-4 py-1.5 text-sm text-white transition-colors hover:bg-red-600"
            >
              Pause
            </button>
          ) : (
            <button
              type="button"
              onClick={play}
              disabled={stepIndex >= steps.length - 1}
              className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm text-white transition-colors hover:bg-indigo-500 disabled:opacity-30"
            >
              Play
            </button>
          )}

          <button
            type="button"
            onClick={() => goTo(stepIndex + 1)}
            disabled={stepIndex >= steps.length - 1}
            className="rounded-md border border-gray-700 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-gray-800 disabled:opacity-30"
          >
            Next
          </button>

          <button
            type="button"
            onClick={() => goTo(steps.length - 1)}
            disabled={stepIndex >= steps.length - 1}
            className="px-2 py-1 text-xs text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
            title="Last"
          >
            {">>"}
          </button>

          <input
            type="range"
            min={0}
            max={steps.length - 1}
            value={stepIndex}
            onChange={(e) => goTo(Number(e.target.value))}
            className="min-w-[8rem] flex-1 h-1.5 accent-indigo-500"
          />

          <span className="min-w-[4rem] text-right text-xs tabular-nums text-gray-500">
            {stepIndex} / {steps.length - 1}
          </span>

          <select
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-400"
          >
            <option value={1000}>1s</option>
            <option value={500}>0.5s</option>
            <option value={250}>0.25s</option>
            <option value={100}>0.1s</option>
          </select>
        </div>
      </div>
    </div>
  );
}
