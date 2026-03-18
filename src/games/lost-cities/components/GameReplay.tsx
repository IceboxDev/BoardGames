import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ALL_STRATEGIES } from "../logic/ai-strategies";
import type { TournamentGameLog } from "../logic/tournament-log";
import { reconstructStates } from "../logic/tournament-log";
import type { Card as CardData } from "../logic/types";
import { COLOR_HEX, EXPEDITION_COLORS } from "../logic/types";
import CardComponent from "./Card";

interface GameReplayProps {
  game: TournamentGameLog;
  onBack: () => void;
}

function ReplayHand({
  cards,
  label,
  highlightCardId,
  isActive,
}: {
  cards: CardData[];
  label: string;
  highlightCardId: number | undefined;
  isActive: boolean;
}) {
  const sorted = useMemo(() => {
    const colorOrder = EXPEDITION_COLORS;
    return [...cards].sort((a, b) => {
      const ci = colorOrder.indexOf(a.color) - colorOrder.indexOf(b.color);
      if (ci !== 0) return ci;
      return a.value - b.value;
    });
  }, [cards]);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span
          className={`text-xs font-semibold uppercase tracking-wider ${
            isActive ? "text-indigo-400" : "text-gray-500"
          }`}
        >
          {label}
        </span>
        <span className="text-[10px] text-gray-600">{cards.length} cards</span>
      </div>
      <div className="flex gap-1 flex-wrap">
        {sorted.map((card) => (
          <CardComponent
            key={card.id}
            card={card}
            size="sm"
            disabled
            glowing={card.id === highlightCardId}
          />
        ))}
        {sorted.length === 0 && <span className="text-xs text-gray-600 italic py-2">Empty</span>}
      </div>
    </div>
  );
}

function ReplayExpeditions({
  expeditions,
  label,
  score,
}: {
  expeditions: CardData[][];
  label: string;
  score: number;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          {label}
        </span>
        <span
          className={`text-xs font-bold tabular-nums ${
            score >= 0 ? "text-green-400" : "text-red-400"
          }`}
        >
          {score}
        </span>
      </div>
      <div className="flex gap-2">
        {EXPEDITION_COLORS.map((color, ci) => {
          const cards = expeditions[ci];
          const hex = COLOR_HEX[color];
          return (
            <div key={color} className="flex flex-col-reverse gap-0.5 min-w-[3rem]">
              {cards.length === 0 ? (
                <div
                  className="w-12 h-[4.5rem] rounded-lg border-2 border-dashed flex items-center justify-center"
                  style={{
                    borderColor: `${hex}30`,
                    backgroundColor: `${hex}08`,
                  }}
                >
                  <span className="text-[0.4rem] font-medium opacity-30" style={{ color: hex }}>
                    {color.slice(0, 3).toUpperCase()}
                  </span>
                </div>
              ) : (
                cards.map((card, i) => (
                  <div key={card.id} style={{ marginTop: i > 0 ? "-3rem" : undefined }}>
                    <CardComponent card={card} size="sm" disabled />
                  </div>
                ))
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReplayDiscards({ piles }: { piles: CardData[][] }) {
  return (
    <div className="flex gap-2">
      {EXPEDITION_COLORS.map((color, ci) => {
        const pile = piles[ci];
        const hex = COLOR_HEX[color];
        const top = pile.length > 0 ? pile[pile.length - 1] : null;
        return (
          <div key={color} className="flex flex-col items-center gap-0.5">
            {top ? (
              <CardComponent card={top} size="sm" disabled />
            ) : (
              <div
                className="w-12 h-[4.5rem] rounded-lg border border-dashed flex items-center justify-center"
                style={{
                  borderColor: `${hex}20`,
                  backgroundColor: `${hex}05`,
                }}
              />
            )}
            {pile.length > 1 && (
              <span className="text-[9px] text-gray-600 tabular-nums">+{pile.length - 1}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function GameReplay({ game, onBack }: GameReplayProps) {
  const states = useMemo(() => reconstructStates(game), [game]);
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(500);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const labelA = ALL_STRATEGIES.find((s) => s.id === game.strategyA)?.label ?? game.strategyA;
  const labelB = ALL_STRATEGIES.find((s) => s.id === game.strategyB)?.label ?? game.strategyB;

  const p0Label = game.aPlaysFirst ? labelA : labelB;
  const p1Label = game.aPlaysFirst ? labelB : labelA;

  const current = states[stepIndex];

  const highlightCardId = current.lastAction?.cardId;

  const stop = useCallback(() => {
    setPlaying(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const play = useCallback(() => {
    if (stepIndex >= states.length - 1) return;
    setPlaying(true);
  }, [stepIndex, states.length]);

  useEffect(() => {
    if (!playing) return;
    intervalRef.current = setInterval(() => {
      setStepIndex((prev) => {
        if (prev >= states.length - 1) {
          stop();
          return prev;
        }
        return prev + 1;
      });
    }, speed);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [playing, speed, states.length, stop]);

  const goTo = (idx: number) => {
    stop();
    setStepIndex(Math.max(0, Math.min(idx, states.length - 1)));
  };

  const actionLogUpToCurrent = useMemo(() => {
    return states.slice(0, stepIndex + 1).map((s, i) => ({
      index: i,
      desc: s.lastActionDescription,
      action: s.lastAction,
    }));
  }, [states, stepIndex]);

  const logEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] max-w-6xl mx-auto px-4 py-4 gap-3">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-lg font-bold text-white">
            Game #{game.gameIndex + 1}: {labelA} vs {labelB}
          </h2>
          <p className="text-xs text-gray-500">
            First player: {game.aPlaysFirst ? labelA : labelB} &middot; Final: {game.scoreA} –{" "}
            {game.scoreB}
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
        >
          Back to Match History
        </button>
      </div>

      {/* Main content: board + action log */}
      <div className="flex flex-1 min-h-0 gap-4">
        {/* Board area */}
        <div className="flex-1 min-w-0 flex flex-col gap-3 overflow-y-auto pr-2">
          {/* Player 1 hand (top) */}
          <ReplayHand
            cards={current.hands[1]}
            label={`${p1Label} (P1)`}
            highlightCardId={current.lastAction?.player === 1 ? highlightCardId : undefined}
            isActive={current.currentPlayer === 1}
          />

          {/* Player 1 expeditions */}
          <ReplayExpeditions
            expeditions={current.expeditions[1]}
            label={`${p1Label} Expeditions`}
            score={current.scores[1]}
          />

          {/* Discard piles + draw pile */}
          <div className="flex items-center gap-4 py-2 border-y border-gray-800/50">
            <div className="flex flex-col items-center gap-1">
              <div className="w-12 h-[4.5rem] rounded-lg border-2 border-gray-600 bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center">
                <span className="text-xs font-bold text-gray-400 tabular-nums">
                  {current.drawPileCount}
                </span>
              </div>
              <span className="text-[9px] text-gray-600">Draw</span>
            </div>
            <div className="flex-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 mb-1 block">
                Discard Piles
              </span>
              <ReplayDiscards piles={current.discardPiles} />
            </div>
          </div>

          {/* Player 0 expeditions */}
          <ReplayExpeditions
            expeditions={current.expeditions[0]}
            label={`${p0Label} Expeditions`}
            score={current.scores[0]}
          />

          {/* Player 0 hand (bottom) */}
          <ReplayHand
            cards={current.hands[0]}
            label={`${p0Label} (P0)`}
            highlightCardId={current.lastAction?.player === 0 ? highlightCardId : undefined}
            isActive={current.currentPlayer === 0}
          />
        </div>

        {/* Action log sidebar */}
        <aside className="w-64 shrink-0 flex flex-col rounded-lg border border-gray-800 bg-gray-900/70 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-800/80 shrink-0">
            <span className="text-[0.65rem] font-semibold uppercase tracking-widest text-gray-500">
              Action Log
            </span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-0.5 scrollbar-thin">
            {actionLogUpToCurrent.map((entry, i) => {
              const isCurrent = i === stepIndex;
              return (
                <button
                  type="button"
                  // biome-ignore lint/suspicious/noArrayIndexKey: static list / chart data points don't reorder
                  key={i}
                  onClick={() => goTo(i)}
                  className={`w-full text-left px-2 py-1 rounded text-[0.65rem] transition-colors ${
                    isCurrent
                      ? "bg-indigo-500/20 text-indigo-300"
                      : "text-gray-400 hover:bg-gray-800/50"
                  }`}
                >
                  <span className="tabular-nums text-gray-600 mr-1.5">{i}.</span>
                  {entry.desc}
                </button>
              );
            })}
            <div ref={logEndRef} />
          </div>
        </aside>
      </div>

      {/* Current action description */}
      <div className="shrink-0 text-center">
        <span className="text-sm text-gray-300 font-medium">{current.lastActionDescription}</span>
      </div>

      {/* Navigation controls */}
      <div className="shrink-0 flex items-center gap-3 py-2 border-t border-gray-800/50">
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
            disabled={stepIndex >= states.length - 1}
            className="px-4 py-1.5 rounded-md bg-indigo-600 text-sm text-white hover:bg-indigo-500 disabled:opacity-30 transition-colors"
          >
            Play
          </button>
        )}

        <button
          type="button"
          onClick={() => goTo(stepIndex + 1)}
          disabled={stepIndex >= states.length - 1}
          className="px-3 py-1.5 rounded-md border border-gray-700 text-sm text-gray-300 hover:bg-gray-800 disabled:opacity-30 transition-colors"
        >
          Next
        </button>
        <button
          type="button"
          onClick={() => goTo(states.length - 1)}
          disabled={stepIndex >= states.length - 1}
          className="px-2 py-1 text-xs text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
          title="Last"
        >
          ⟩⟩
        </button>

        <input
          type="range"
          min={0}
          max={states.length - 1}
          value={stepIndex}
          onChange={(e) => goTo(Number(e.target.value))}
          className="flex-1 h-1.5 accent-indigo-500"
        />

        <span className="text-xs text-gray-500 tabular-nums min-w-[4rem] text-right">
          {stepIndex} / {states.length - 1}
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
  );
}
