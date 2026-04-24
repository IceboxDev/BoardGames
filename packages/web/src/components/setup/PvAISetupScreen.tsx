import { useCallback, useMemo, useState } from "react";
import { OptionCard } from "./OptionCard";
import { SectionLabel } from "./SectionLabel";
import { SetupHeader } from "./SetupHeader";
import { SetupLayout } from "./SetupLayout";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StrategyOption {
  id: string;
  label: string;
  description: string;
  difficulty: string;
  accentColor: string;
  badgeClass: string;
}

export interface PvAISetupScreenProps {
  title: string;
  /** Player count options. Omit for 2-player-only games. */
  playerCounts?: number[];
  /** Default player count (defaults to first in playerCounts, or 2). */
  defaultPlayerCount?: number;
  /** Strategy list, or a function returning strategies for the given player count. Ordered easiest to hardest. */
  strategies: StrategyOption[] | ((playerCount: number) => StrategyOption[]);
  /** Default selected strategy ID (defaults to first strategy). */
  defaultStrategy?: string;
  /** Called when user clicks Start. */
  onStart: (playerCount: number, strategyId: string) => void;
}

// ---------------------------------------------------------------------------
// Grid column mapping (Tailwind needs static classes)
// ---------------------------------------------------------------------------

const GRID_COLS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
};

function gridColsClass(count: number): string {
  return GRID_COLS[Math.min(count, 4)] ?? "grid-cols-4";
}

// ---------------------------------------------------------------------------
// Player count stepper
// ---------------------------------------------------------------------------

function PlayerCountStepper({
  min,
  max,
  value,
  onChange,
}: {
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
}) {
  const canDecrement = value > min;
  const canIncrement = value < max;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={!canDecrement}
          onClick={() => onChange(value - 1)}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-700 bg-gray-800/80 text-lg text-gray-300 transition hover:border-gray-500 hover:bg-gray-700 hover:text-white disabled:pointer-events-none disabled:opacity-30"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M4 10a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H4.75A.75.75 0 014 10z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        <div className="flex w-20 flex-col items-center justify-center">
          <span className="text-3xl font-extrabold tabular-nums tracking-tight text-white">
            {value}
          </span>
        </div>

        <button
          type="button"
          disabled={!canIncrement}
          onClick={() => onChange(value + 1)}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-700 bg-gray-800/80 text-lg text-gray-300 transition hover:border-gray-500 hover:bg-gray-700 hover:text-white disabled:pointer-events-none disabled:opacity-30"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
            <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
          </svg>
        </button>
      </div>

      <p className="text-xs text-gray-500">
        You + {value - 1} bot{value > 2 ? "s" : ""}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PvAISetupScreen({
  title,
  playerCounts,
  defaultPlayerCount,
  strategies: strategiesProp,
  defaultStrategy,
  onStart,
}: PvAISetupScreenProps) {
  const initialPlayerCount = defaultPlayerCount ?? playerCounts?.[0] ?? 2;
  const [playerCount, setPlayerCount] = useState(initialPlayerCount);

  const currentStrategies = useMemo(
    () => (typeof strategiesProp === "function" ? strategiesProp(playerCount) : strategiesProp),
    [strategiesProp, playerCount],
  );

  const [selectedId, setSelectedId] = useState(defaultStrategy ?? currentStrategies[0]?.id ?? "");

  // Reset selection when strategy list changes and current selection is no longer valid
  const validSelection = currentStrategies.some((s) => s.id === selectedId);
  const effectiveId = validSelection ? selectedId : (currentStrategies[0]?.id ?? "");

  const handleStart = useCallback(() => {
    onStart(playerCount, effectiveId);
  }, [onStart, playerCount, effectiveId]);

  const showPlayerCount = playerCounts && playerCounts.length > 1;
  const subtitle = showPlayerCount
    ? "Choose how many players and your AI opponent"
    : "Choose your AI opponent";

  return (
    <SetupLayout>
      <SetupHeader title={title} subtitle={subtitle} />

      {showPlayerCount && (
        <div className="mb-8">
          <SectionLabel>Number of players</SectionLabel>
          <PlayerCountStepper
            min={playerCounts[0]}
            max={playerCounts[playerCounts.length - 1]}
            value={playerCount}
            onChange={setPlayerCount}
          />
        </div>
      )}

      <SectionLabel>Choose your opponent</SectionLabel>

      <div
        className={`mb-8 grid w-full min-w-0 max-w-6xl gap-2 sm:gap-4 ${gridColsClass(currentStrategies.length)}`}
      >
        {currentStrategies.map((strat, index) => {
          const stars = index + 1;
          return (
            <OptionCard
              key={strat.id}
              accentColor={strat.accentColor}
              selected={effectiveId === strat.id}
              className="min-w-0 !px-2 !py-3 sm:!px-4 sm:!py-5"
              onClick={() => setSelectedId(strat.id)}
            >
              <div className="mb-1.5 flex items-start justify-between gap-0.5 sm:mb-3">
                <span
                  className={`inline-flex max-w-[4.5rem] items-center truncate rounded-full px-1 py-0.5 text-[8px] font-semibold uppercase tracking-tight ring-1 ring-inset sm:max-w-none sm:px-2.5 sm:text-[10px] sm:tracking-wider ${strat.badgeClass}`}
                >
                  {strat.difficulty}
                </span>
                <div className="flex shrink-0 gap-px sm:gap-0.5">
                  {Array.from({ length: currentStrategies.length }, (_, i) => i + 1).map((n) => (
                    <svg
                      key={n}
                      viewBox="0 0 20 20"
                      aria-hidden="true"
                      fill={n <= stars ? strat.accentColor : "currentColor"}
                      className={`h-2.5 w-2.5 sm:h-3.5 sm:w-3.5 ${n <= stars ? "" : "text-gray-700"}`}
                    >
                      <path
                        fillRule="evenodd"
                        d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ))}
                </div>
              </div>

              <span className="mb-0.5 block text-[11px] font-bold leading-tight text-white transition-colors group-hover:text-white sm:mb-1 sm:text-lg">
                {strat.label}
              </span>

              <span className="line-clamp-4 text-[9px] leading-snug text-gray-400 sm:line-clamp-none sm:text-sm sm:leading-relaxed">
                {strat.description}
              </span>
            </OptionCard>
          );
        })}
      </div>

      <div className="flex justify-center pt-2">
        <button
          type="button"
          onClick={handleStart}
          className="rounded-xl bg-emerald-600 px-8 py-3 font-semibold text-white transition hover:bg-emerald-500"
        >
          Start Game
        </button>
      </div>
    </SetupLayout>
  );
}
