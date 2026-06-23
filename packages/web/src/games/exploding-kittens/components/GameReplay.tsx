import type { EKGameReplayLog } from "@boardgames/core/games/exploding-kittens/replay-log";
import { snapshotToGameState } from "@boardgames/core/games/exploding-kittens/replay-log";
import type { ActionLogEntry, GameState } from "@boardgames/core/games/exploding-kittens/types";
import { useMemo } from "react";
import { ReplayControls, useReplayPlayback } from "../../../components/replay";
import GameBoard from "./GameBoard";

interface GameReplayProps {
  game: EKGameReplayLog;
}

function OldFormatNotice() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <p className="text-sm text-fg-secondary">
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

  const playback = useReplayPlayback(steps.length);

  const currentStep = steps[playback.stepIndex];
  const boardState = gameStates[playback.stepIndex];

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

      <div className="shrink-0 border-t border-white/10 bg-surface-900/80 px-4 py-3">
        <ReplayControls playback={playback} description={currentStep.description} />
      </div>
    </div>
  );
}
