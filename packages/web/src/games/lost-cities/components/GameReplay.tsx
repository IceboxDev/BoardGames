import { ALL_STRATEGIES } from "@boardgames/core/games/lost-cities/ai-strategies";
import { CARD_INFO } from "@boardgames/core/games/lost-cities/mcts/types";
import type {
  MCTSActionStats,
  TournamentGameLog,
} from "@boardgames/core/games/lost-cities/tournament-log";
import {
  getReplaySteps,
  replayStepToGameState,
  stepToReplayState,
} from "@boardgames/core/games/lost-cities/tournament-log";
import { EXPEDITION_COLORS } from "@boardgames/core/games/lost-cities/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useDocumentTitle from "../../../hooks/useDocumentTitle";
import GameBoard from "./GameBoard";

interface GameReplayProps {
  game: TournamentGameLog;
}

function formatPlayActionLabel(a: MCTSActionStats): string {
  if (a.cardId === undefined) return a.key;
  const info = CARD_INFO[a.cardId];
  const colorName = EXPEDITION_COLORS[info.color];
  const valueStr = info.type === 0 ? "W" : String(info.value);
  return a.kind === 0
    ? `${colorName} ${valueStr} → expedition`
    : `Discard ${colorName} ${valueStr}`;
}

function formatDrawActionLabel(a: MCTSActionStats): string {
  if (a.key === "D") return "Draw pile";
  const match = a.key.match(/^P:(\d+)$/);
  if (match) return `${EXPEDITION_COLORS[Number(match[1])]} discard`;
  return a.key;
}

function MCTSDecisionPanel({
  playActions,
  drawActions,
}: {
  playActions?: MCTSActionStats[];
  drawActions?: MCTSActionStats[];
}) {
  const maxVisits = useMemo(() => {
    const all = [...(playActions ?? []), ...(drawActions ?? [])];
    return Math.max(1, ...all.map((a) => a.visits));
  }, [playActions, drawActions]);

  const renderActions = (actions: MCTSActionStats[], format: (a: MCTSActionStats) => string) => (
    <div className="space-y-1.5">
      {actions.map((a) => (
        <div key={a.key} className="flex items-center gap-2">
          <div
            className={`flex-1 min-w-0 rounded px-2 py-1 text-[0.65rem] ${
              a.chosen
                ? "bg-indigo-500/30 text-indigo-200 font-semibold"
                : "bg-gray-800/60 text-gray-400"
            }`}
          >
            <div className="flex justify-between items-baseline gap-2">
              <span className="truncate">{format(a)}</span>
              <span className="tabular-nums shrink-0">
                {a.visits} · {((a.meanNormalizedReward ?? a.winRate ?? 0) * 100).toFixed(0)}%
              </span>
            </div>
            <div
              className="mt-0.5 h-1 rounded-full bg-gray-700 overflow-hidden"
              style={{ width: "100%" }}
            >
              <div
                className="h-full rounded-full bg-indigo-500/70"
                style={{ width: `${(a.visits / maxVisits) * 100}%` }}
              />
            </div>
          </div>
          {a.chosen && (
            <span className="text-indigo-400 text-[0.6rem] shrink-0" title="Chosen">
              ✓
            </span>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {playActions && playActions.length > 0 && (
        <div>
          <span className="text-[0.6rem] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">
            MCTS Play
          </span>
          {renderActions(playActions, formatPlayActionLabel)}
        </div>
      )}
      {drawActions && drawActions.length > 0 && (
        <div>
          <span className="text-[0.6rem] font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">
            MCTS Draw
          </span>
          {renderActions(drawActions, formatDrawActionLabel)}
        </div>
      )}
    </div>
  );
}

export default function GameReplay({ game }: GameReplayProps) {
  const steps = useMemo(() => getReplaySteps(game), [game]);
  const replayStates = useMemo(() => steps.map(stepToReplayState), [steps]);
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(500);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const labelA = ALL_STRATEGIES.find((s) => s.id === game.strategyA)?.label ?? game.strategyA;
  const labelB = ALL_STRATEGIES.find((s) => s.id === game.strategyB)?.label ?? game.strategyB;
  const firstPlayerLabel = game.aPlaysFirst ? labelA : labelB;

  const p0Label = game.aPlaysFirst ? labelA : labelB;
  const p1Label = game.aPlaysFirst ? labelB : labelA;

  useDocumentTitle(
    `Replay #${game.gameIndex + 1} · ${labelA} vs ${labelB} · ${game.scoreA}–${game.scoreB} · Lost Cities`,
  );

  const boardState = useMemo(() => replayStepToGameState(steps[stepIndex]), [steps, stepIndex]);
  const rs = replayStates[stepIndex];
  const currentStep = steps[stepIndex];

  const highlightCardId = rs.lastAction?.cardId;

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

  const mcts = currentStep?.mcts;

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[90rem] flex-1 flex-col gap-2 overflow-hidden px-3 py-2">
      <div className="flex flex-1 min-h-0 gap-3 overflow-hidden">
        <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden xl:max-w-2xl xl:mx-auto w-full">
          <GameBoard
            mode="replay"
            state={boardState}
            replayLabels={[p0Label, p1Label]}
            replayTopHand={{
              cards: rs.hands[1],
              label: `${p1Label} (P1)`,
              highlightCardId: rs.lastAction?.player === 1 ? highlightCardId : undefined,
              isActive: rs.currentPlayer === 1,
            }}
            replayBottomHand={{
              cards: rs.hands[0],
              label: `${p0Label} (P0)`,
              highlightCardId: rs.lastAction?.player === 0 ? highlightCardId : undefined,
              isActive: rs.currentPlayer === 0,
            }}
            replayCompact
          />
        </div>

        <aside className="hidden xl:flex w-52 shrink-0 flex-col min-h-0 self-stretch overflow-hidden rounded-lg border border-gray-800 bg-gray-900/70">
          <div className="px-2 py-1.5 border-b border-gray-800/80 shrink-0 space-y-0.5">
            <span className="text-[0.65rem] font-semibold uppercase tracking-widest text-gray-500">
              MCTS
            </span>
            <p className="text-[10px] text-gray-400 leading-snug">
              Game {game.gameIndex + 1} · {labelA} vs {labelB}
            </p>
            <p className="text-[10px] text-gray-500 leading-snug">
              First {firstPlayerLabel} · Final {game.scoreA}–{game.scoreB}
            </p>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-2 scrollbar-thin">
            {mcts && (mcts.play?.actions?.length || mcts.draw?.actions?.length) ? (
              <MCTSDecisionPanel
                playActions={mcts.play?.actions}
                drawActions={mcts.draw?.actions}
              />
            ) : (
              <p className="text-[10px] text-gray-600 leading-snug">
                No MCTS breakdown for this step (e.g. initial position).
              </p>
            )}
          </div>
        </aside>
      </div>

      <div className="xl:hidden shrink-0 flex flex-col h-[28vh] min-h-0 overflow-hidden rounded-lg border border-gray-800 bg-gray-900/70">
        <div className="px-2 py-1 border-b border-gray-800/80 shrink-0 flex items-center justify-between gap-2">
          <span className="text-[0.65rem] font-semibold uppercase tracking-widest text-gray-500">
            MCTS
          </span>
          <span className="text-[9px] text-gray-600 truncate">
            G{game.gameIndex + 1} · {game.scoreA}–{game.scoreB}
          </span>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-2 scrollbar-thin">
          {mcts && (mcts.play?.actions?.length || mcts.draw?.actions?.length) ? (
            <MCTSDecisionPanel playActions={mcts.play?.actions} drawActions={mcts.draw?.actions} />
          ) : (
            <p className="text-[10px] text-gray-600">No MCTS for this step.</p>
          )}
        </div>
      </div>

      <div className="shrink-0 flex flex-col gap-1.5 border-t border-gray-800/50 pt-2">
        <p
          className="text-center text-[11px] text-gray-400 px-2 truncate"
          title={rs.lastActionDescription}
        >
          {rs.lastActionDescription}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => goTo(0)}
            disabled={stepIndex === 0}
            className="px-2 py-1 text-xs text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
            title="First"
          >
            ⟨⟨
          </button>
          <button
            type="button"
            onClick={() => goTo(stepIndex - 1)}
            disabled={stepIndex === 0}
            className="px-3 py-1.5 rounded-md border border-gray-700 text-sm text-gray-300 hover:bg-gray-800 disabled:opacity-30 transition-colors"
          >
            Prev
          </button>

          {playing ? (
            <button
              type="button"
              onClick={stop}
              className="px-4 py-1.5 rounded-md bg-red-600/80 text-sm text-white hover:bg-red-600 transition-colors"
            >
              Pause
            </button>
          ) : (
            <button
              type="button"
              onClick={play}
              disabled={stepIndex >= steps.length - 1}
              className="px-4 py-1.5 rounded-md bg-indigo-600 text-sm text-white hover:bg-indigo-500 disabled:opacity-30 transition-colors"
            >
              Play
            </button>
          )}

          <button
            type="button"
            onClick={() => goTo(stepIndex + 1)}
            disabled={stepIndex >= steps.length - 1}
            className="px-3 py-1.5 rounded-md border border-gray-700 text-sm text-gray-300 hover:bg-gray-800 disabled:opacity-30 transition-colors"
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
            ⟩⟩
          </button>

          <input
            type="range"
            min={0}
            max={steps.length - 1}
            value={stepIndex}
            onChange={(e) => goTo(Number(e.target.value))}
            className="flex-1 min-w-[8rem] h-1.5 accent-indigo-500"
          />

          <span className="text-xs text-gray-500 tabular-nums min-w-[4rem] text-right">
            {stepIndex} / {steps.length - 1}
          </span>

          <select
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-400"
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
