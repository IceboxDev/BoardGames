import {
  type GameManifest,
  type StrategyInfo,
  strategiesFor,
} from "@boardgames/core/machines/manifest";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { Button } from "../ui/Button";
import { SelectableCard } from "../ui/SelectableCard";
import { Stepper } from "../ui/Stepper";
import { DIFFICULTY } from "./difficulty";
import { SectionLabel } from "./SectionLabel";
import { SetupHeader } from "./SetupHeader";
import { SetupLayout } from "./SetupLayout";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** An AI option on the setup screen — the manifest's own description of it. */
export type StrategyOption = StrategyInfo;

export interface PvAISetupScreenProps {
  title: string;
  /** The game's AIs (easiest first, each with its difficulty tier) and table sizes. */
  manifest: GameManifest;
  /** Table sizes on offer; defaults to every size the manifest allows. */
  playerCounts?: number[];
  /** Default player count (defaults to the smallest on offer). */
  defaultPlayerCount?: number;
  /** Called when user clicks Start, with an AI the game offers at that size. */
  onStart: (playerCount: number, strategyId: string) => void;
  /** Optional extra controls (e.g. an expansion toggle) shown above Start. */
  extraControls?: ReactNode;
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
// Component
// ---------------------------------------------------------------------------

export function PvAISetupScreen({
  title,
  manifest,
  playerCounts: playerCountsProp,
  defaultPlayerCount,
  onStart,
  extraControls,
}: PvAISetupScreenProps) {
  const playerCounts = useMemo(
    () =>
      playerCountsProp ??
      Array.from(
        { length: manifest.seats.max - manifest.seats.min + 1 },
        (_, i) => manifest.seats.min + i,
      ),
    [playerCountsProp, manifest.seats],
  );
  const initialPlayerCount = defaultPlayerCount ?? playerCounts[0] ?? manifest.seats.min;
  const [playerCount, setPlayerCount] = useState(initialPlayerCount);

  const currentStrategies = useMemo(
    () => strategiesFor(manifest, playerCount),
    [manifest, playerCount],
  );

  const [selectedId, setSelectedId] = useState(
    manifest.defaultStrategy ?? currentStrategies[0]?.id ?? "",
  );

  // Reset selection when strategy list changes and current selection is no longer valid
  const validSelection = currentStrategies.some((s) => s.id === selectedId);
  const effectiveId = validSelection ? selectedId : (currentStrategies[0]?.id ?? "");

  const handleStart = useCallback(() => {
    onStart(playerCount, effectiveId);
  }, [onStart, playerCount, effectiveId]);

  const showPlayerCount = playerCounts.length > 1;
  const subtitle = showPlayerCount
    ? "Choose how many players and your AI opponent"
    : "Choose your AI opponent";

  return (
    <SetupLayout>
      <SetupHeader title={title} subtitle={subtitle} />

      {showPlayerCount && (
        <div className="mb-8">
          <SectionLabel>Number of players</SectionLabel>
          <Stepper
            label="Player count"
            caption={`You + ${playerCount - 1} bot${playerCount > 2 ? "s" : ""}`}
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
          const diff = DIFFICULTY[strat.difficulty];
          return (
            <SelectableCard
              key={strat.id}
              variant="stripe"
              accentColor={diff.accentColor}
              selected={effectiveId === strat.id}
              padding="sm"
              className="min-w-0"
              onClick={() => setSelectedId(strat.id)}
            >
              <div className="mb-1.5 flex items-start justify-between gap-0.5 sm:mb-3">
                <span
                  className={`inline-flex max-w-18 items-center truncate rounded-full px-1 py-0.5 text-5xs font-semibold uppercase tracking-tight ring-1 ring-inset sm:max-w-none sm:px-2.5 sm:text-3xs sm:tracking-label ${diff.badgeClass}`}
                >
                  {strat.difficulty}
                </span>
                <div className="flex shrink-0 gap-px sm:gap-0.5">
                  {Array.from({ length: currentStrategies.length }, (_, i) => i + 1).map((n) => (
                    <svg
                      key={n}
                      viewBox="0 0 20 20"
                      aria-hidden="true"
                      fill={n <= stars ? diff.accentColor : "currentColor"}
                      className={`h-2.5 w-2.5 sm:h-3.5 sm:w-3.5 ${n <= stars ? "" : "text-fg-disabled"}`}
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

              <span className="mb-0.5 block text-2xs font-bold leading-tight text-fg-strong transition-colors group-hover:text-fg-strong sm:mb-1 sm:text-lg">
                {strat.label}
              </span>

              <span className="line-clamp-4 text-3xs leading-snug text-fg-secondary sm:line-clamp-none sm:text-sm sm:leading-relaxed">
                {strat.description}
              </span>
            </SelectableCard>
          );
        })}
      </div>

      {extraControls && <div className="mb-6 flex justify-center">{extraControls}</div>}

      <div className="flex justify-center pt-2">
        <Button variant="primary" size="lg" onClick={handleStart}>
          Start Game
        </Button>
      </div>
    </SetupLayout>
  );
}
