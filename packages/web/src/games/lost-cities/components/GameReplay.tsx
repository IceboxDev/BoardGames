import { ALL_STRATEGIES } from "@boardgames/core/games/lost-cities/ai-strategies";
import { CARD_INFO } from "@boardgames/core/games/lost-cities/mcts/types";
import type {
  MCTSActionStats,
  TournamentGameLog,
} from "@boardgames/core/games/lost-cities/tournament-log";
import {
  getReplaySteps,
  stepToReplayState,
} from "@boardgames/core/games/lost-cities/tournament-log";
import type {
  Card,
  DiscardPiles,
  Expeditions,
  PlayerIndex,
} from "@boardgames/core/games/lost-cities/types";
import { EXPEDITION_COLORS } from "@boardgames/core/games/lost-cities/types";
import { useMemo } from "react";
import { ReplayControls, useReplayPlayback } from "../../../components/replay";
import useDocumentTitle from "../../../hooks/useDocumentTitle";
import type { BoardState } from "./GameBoard";
import GameBoard from "./GameBoard";

function expeditionsFromColorArrays(cols: Card[][]): Expeditions {
  return {
    yellow: cols[0] ?? [],
    blue: cols[1] ?? [],
    white: cols[2] ?? [],
    green: cols[3] ?? [],
    red: cols[4] ?? [],
  };
}

function discardPilesFromArrays(piles: Card[][]): DiscardPiles {
  return {
    yellow: piles[0] ?? [],
    blue: piles[1] ?? [],
    white: piles[2] ?? [],
    green: piles[3] ?? [],
    red: piles[4] ?? [],
  };
}

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
                ? "bg-accent-500/30 text-accent-200 font-semibold"
                : "bg-surface-800/60 text-fg-secondary"
            }`}
          >
            <div className="flex justify-between items-baseline gap-2">
              <span className="truncate">{format(a)}</span>
              <span className="tabular-nums shrink-0">
                {a.visits} · {((a.meanNormalizedReward ?? a.winRate ?? 0) * 100).toFixed(0)}%
              </span>
            </div>
            <div
              className="mt-0.5 h-1 rounded-full bg-surface-700 overflow-hidden"
              style={{ width: "100%" }}
            >
              <div
                className="h-full rounded-full bg-accent-500/70"
                style={{ width: `${(a.visits / maxVisits) * 100}%` }}
              />
            </div>
          </div>
          {a.chosen && (
            <span className="text-accent-400 text-[0.6rem] shrink-0" title="Chosen">
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
          <span className="text-[0.6rem] font-semibold uppercase tracking-wider text-fg-muted block mb-1.5">
            MCTS Play
          </span>
          {renderActions(playActions, formatPlayActionLabel)}
        </div>
      )}
      {drawActions && drawActions.length > 0 && (
        <div>
          <span className="text-[0.6rem] font-semibold uppercase tracking-wider text-fg-muted block mb-1.5">
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
  const playback = useReplayPlayback(steps.length);

  const labelA = ALL_STRATEGIES.find((s) => s.id === game.strategyA)?.label ?? game.strategyA;
  const labelB = ALL_STRATEGIES.find((s) => s.id === game.strategyB)?.label ?? game.strategyB;
  const firstPlayerLabel = game.aPlaysFirst ? labelA : labelB;

  const p0Label = game.aPlaysFirst ? labelA : labelB;
  const p1Label = game.aPlaysFirst ? labelB : labelA;

  useDocumentTitle(
    `Replay #${game.gameIndex + 1} · ${labelA} vs ${labelB} · ${game.scoreA}–${game.scoreB} · Lost Cities`,
  );

  const rs = replayStates[playback.stepIndex];
  const currentStep = steps[playback.stepIndex];

  const boardState = useMemo<BoardState>(() => {
    const gameOver = rs.hands[0].length === 0 && rs.hands[1].length === 0 && rs.drawPileCount === 0;
    return {
      expeditions: [
        expeditionsFromColorArrays(rs.expeditions[0]),
        expeditionsFromColorArrays(rs.expeditions[1]),
      ],
      discardPiles: discardPilesFromArrays(rs.discardPiles),
      drawPileCount: rs.drawPileCount,
      currentPlayer: rs.currentPlayer as PlayerIndex,
      turnPhase: rs.turnPhase === 0 ? "play" : "draw",
      phase: gameOver ? "game-over" : "playing",
      lastDiscardedColor: null,
      turnCount: currentStep.turn,
    };
  }, [rs, currentStep]);

  const highlightCardId = rs.lastAction?.cardId;

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

        <aside className="hidden xl:flex w-52 shrink-0 flex-col min-h-0 self-stretch overflow-hidden rounded-lg border border-white/10 bg-surface-900/70">
          <div className="px-2 py-1.5 border-b border-white/10 shrink-0 space-y-0.5">
            <span className="text-[0.65rem] font-semibold uppercase tracking-widest text-fg-muted">
              MCTS
            </span>
            <p className="text-3xs text-fg-secondary leading-snug">
              Game {game.gameIndex + 1} · {labelA} vs {labelB}
            </p>
            <p className="text-3xs text-fg-muted leading-snug">
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
              <p className="text-3xs text-fg-disabled leading-snug">
                No MCTS breakdown for this step (e.g. initial position).
              </p>
            )}
          </div>
        </aside>
      </div>

      <div className="xl:hidden shrink-0 flex flex-col h-[28vh] min-h-0 overflow-hidden rounded-lg border border-white/10 bg-surface-900/70">
        <div className="px-2 py-1 border-b border-white/10 shrink-0 flex items-center justify-between gap-2">
          <span className="text-[0.65rem] font-semibold uppercase tracking-widest text-fg-muted">
            MCTS
          </span>
          <span className="text-[9px] text-fg-disabled truncate">
            G{game.gameIndex + 1} · {game.scoreA}–{game.scoreB}
          </span>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-2 scrollbar-thin">
          {mcts && (mcts.play?.actions?.length || mcts.draw?.actions?.length) ? (
            <MCTSDecisionPanel playActions={mcts.play?.actions} drawActions={mcts.draw?.actions} />
          ) : (
            <p className="text-3xs text-fg-disabled">No MCTS for this step.</p>
          )}
        </div>
      </div>

      <ReplayControls playback={playback} description={rs.lastActionDescription} />
    </div>
  );
}
