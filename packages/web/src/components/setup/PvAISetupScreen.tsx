import {
  type GameManifest,
  type StrategyInfo,
  strategiesFor,
} from "@boardgames/core/machines/manifest";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { Stepper } from "../ui/Stepper";
import { SetupBriefing, SetupFooter, SetupSection } from "./SetupBriefing";
import { SetupChoiceCards } from "./SetupChoiceCards";
import { type SetupOption, SetupOptions } from "./SetupOptions";

// ---------------------------------------------------------------------------
// The solo setup every game against the AI shares: the Briefing (the game's
// art, one row of AI levels, the game's options across the full width,
// Start). Fits a laptop screen without scrolling.
// ---------------------------------------------------------------------------

/** An AI option on the setup screen — the manifest's own description of it. */
export type StrategyOption = StrategyInfo;

/** What the summary and the options can depend on. */
export interface SetupState {
  playerCount: number;
  strategy: StrategyInfo | undefined;
}

export interface PvAISetupScreenProps {
  title: string;
  /** The game's AIs (easiest first, each with its difficulty tier) and table sizes. */
  manifest: GameManifest;
  /** Table sizes on offer; defaults to every size the manifest allows. */
  playerCounts?: number[];
  /** Default player count (defaults to the smallest on offer). */
  defaultPlayerCount?: number;
  /** The AI picked at first (a remembered choice); defaults to the manifest's. */
  initialStrategy?: string;
  /** Called when user clicks Start, with an AI the game offers at that size. */
  onStart: (playerCount: number, strategyId: string) => void;
  /** The game's own options, laid out across the full width (after Players). */
  options?: readonly SetupOption[] | ((state: SetupState) => readonly SetupOption[]);
  /** One line under the title; defaults to the game's short description. */
  blurb?: ReactNode;
  /** Small caps line above the title; defaults to "Solo · you + n AI". */
  eyebrow?: ReactNode;
  /** The footer's line; defaults to the AI and the table size. */
  summary?: (state: SetupState) => ReactNode;
  startLabel?: ReactNode;
  /** The word in front of each AI card's number. */
  fileWord?: string;
  /** The chosen AI card's stamp. */
  stamp?: string;
}

const aiCount = (players: number) => `${players - 1} AI`;

export function PvAISetupScreen({
  title,
  manifest,
  playerCounts: playerCountsProp,
  defaultPlayerCount,
  onStart,
  options,
  initialStrategy,
  blurb,
  eyebrow,
  summary,
  startLabel,
  fileWord,
  stamp,
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
  const [chosenCount, setPlayerCount] = useState(initialPlayerCount);
  // A game whose mode sets the table size (Decrypto) changes `playerCounts`
  // under us: a count no longer on offer falls back to the first one.
  const playerCount = playerCounts.includes(chosenCount)
    ? chosenCount
    : (playerCounts[0] ?? chosenCount);

  const currentStrategies = useMemo(
    () => strategiesFor(manifest, playerCount),
    [manifest, playerCount],
  );

  const [selectedId, setSelectedId] = useState(
    initialStrategy ?? manifest.defaultStrategy ?? currentStrategies[0]?.id ?? "",
  );

  // A selection the current table size doesn't offer falls back to the first AI.
  const validSelection = currentStrategies.some((s) => s.id === selectedId);
  const effectiveId = validSelection ? selectedId : (currentStrategies[0]?.id ?? "");
  const strategy = currentStrategies.find((s) => s.id === effectiveId);
  const state: SetupState = { playerCount, strategy };

  const handleStart = useCallback(() => {
    onStart(playerCount, effectiveId);
  }, [onStart, playerCount, effectiveId]);

  const showPlayerCount = playerCounts.length > 1;
  const min = playerCounts[0] ?? playerCount;
  const max = playerCounts[playerCounts.length - 1] ?? playerCount;
  const gameOptions = typeof options === "function" ? options(state) : (options ?? []);
  const allOptions: SetupOption[] = [
    ...(showPlayerCount
      ? [
          {
            id: "players",
            label: "Players",
            span: gameOptions.length === 0 ? ("full" as const) : ("s" as const),
            control: (
              <Stepper
                label="Player count"
                size="sm"
                min={min}
                max={max}
                value={playerCount}
                onChange={setPlayerCount}
                className="flex-row gap-3"
                caption={`You + ${aiCount(playerCount)}`}
              />
            ),
          },
        ]
      : []),
    ...gameOptions,
  ];
  const ais = playerCount - 1;

  return (
    <SetupBriefing
      title={title}
      eyebrow={eyebrow ?? `Solo · you + ${aiCount(playerCount)}`}
      blurb={blurb}
      footer={
        <SetupFooter
          summary={
            summary
              ? summary(state)
              : `${playerCount} players · ${ais === 1 ? "" : `${ais} × `}${strategy?.label ?? ""}`
          }
          startLabel={startLabel}
          onStart={handleStart}
        />
      }
    >
      <SetupSection
        label="Choose the AI"
        aside={
          ais === 1 ? "Your opponent plays at this level" : `All ${ais} AI seats play at this level`
        }
      >
        <SetupChoiceCards
          label="AI level"
          choices={currentStrategies.map((s) => ({
            id: s.id,
            label: s.label,
            description: s.description,
            tier: s.difficulty,
          }))}
          value={effectiveId}
          onChange={setSelectedId}
          fileWord={fileWord}
          stamp={stamp}
        />
      </SetupSection>
      {allOptions.length > 0 && (
        <SetupSection label="Game">
          <SetupOptions options={allOptions} />
        </SetupSection>
      )}
    </SetupBriefing>
  );
}
