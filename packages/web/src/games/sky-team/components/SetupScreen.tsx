import { useMemo, useState } from "react";
import { ControlGroup, SectionHeading } from "../../../components/setup";
import { Button } from "../../../components/ui/Button";
import { SCENARIO_CARDS } from "../scenarios";
import ScenarioPicker from "./ScenarioPicker";

export interface SkyTeamStartConfig {
  scenarioId: string;
  humanPlayers: number[];
  aiStrategy: string;
}

interface Props {
  onStart: (config: SkyTeamStartConfig) => void;
}

interface SeatOption {
  id: 0 | 1;
  label: string;
  description: string;
  accentColor: string;
}

interface StrategyOption {
  id: string;
  label: string;
  description: string;
  difficulty: string;
  accentColor: string;
  badgeClass: string;
}

const SEATS: SeatOption[] = [
  {
    id: 0,
    label: "Pilot",
    description: "Blue side • deploys gear",
    accentColor: "#38bdf8",
  },
  {
    id: 1,
    label: "Co-Pilot",
    description: "Orange side • deploys flaps",
    accentColor: "#f97316",
  },
];

const STRATEGIES: StrategyOption[] = [
  {
    id: "heuristic-v1",
    label: "Heuristic",
    description:
      "Rule-based AI: safe placements, advances under pressure, spends coffee sparingly.",
    difficulty: "Medium",
    accentColor: "#f59e0b",
    badgeClass: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  },
];

const DEFAULT_SCENARIO_SLUG = SCENARIO_CARDS.find((s) => s.backendId != null)?.slug ?? "yul-green";

/**
 * Sky Team setup screen. Fills the entire `#app-main` viewport with no
 * scrollbar (universal setup-screen rule). Layout vertical strips:
 *
 *   1. Title strip (slim)              — name + tagline
 *   2. Crew + AI + Start strip (~28%)  — three logical groups: who's
 *                                        flying, who's flying with them,
 *                                        the launch button
 *   3. Destination strip (FLEX-1)      — scenario gallery, 4 difficulty
 *                                        columns, cards stretch to fill
 *
 * The controls sit on TOP and the destination gallery fills the rest —
 * the multiplayer lobby (wide layout) stacks its room/crew/launch strip
 * the same way, so the two screens mirror each other.
 *
 * Every flex parent carries `min-h-0` so child overflow never forces the
 * page to scroll.
 */
export default function SetupScreen({ onStart }: Props) {
  const [scenarioSlug, setScenarioSlug] = useState(DEFAULT_SCENARIO_SLUG);
  const [seat, setSeat] = useState<0 | 1>(0);
  const [strategyId, setStrategyId] = useState(STRATEGIES[0].id);

  const selectedCard = useMemo(
    () => SCENARIO_CARDS.find((s) => s.slug === scenarioSlug),
    [scenarioSlug],
  );

  const start = () => {
    const backendId = selectedCard?.backendId ?? "yul-montreal";
    onStart({ scenarioId: backendId, humanPlayers: [seat], aiStrategy: strategyId });
  };

  const seatLabel = seat === 0 ? "Pilot" : "Co-Pilot";

  return (
    <div className="relative z-10 flex h-full min-h-0 w-full flex-col overflow-hidden px-4 pb-4 pt-3 sm:px-6 sm:pb-5 sm:pt-4">
      <header className="mb-3 flex shrink-0 items-baseline gap-3">
        <h1 className="text-xl font-bold text-white sm:text-2xl">Sky Team</h1>
        <p className="text-xs text-fg-secondary sm:text-sm">
          Pick a destination, your seat, and an AI partner
        </p>
      </header>

      {/* Controls strip — fixed-height logical groups for Crew, AI, and Start. */}
      <section className="grid shrink-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.1fr)_minmax(0,1fr)]">
        <ControlGroup label="Crew">
          <div className="grid h-full grid-cols-2 gap-2">
            {SEATS.map((opt) => (
              <SeatCard
                key={opt.id}
                option={opt}
                selected={seat === opt.id}
                onSelect={() => setSeat(opt.id)}
              />
            ))}
          </div>
        </ControlGroup>

        <ControlGroup label="AI Partner">
          <div className="flex h-full flex-col gap-2">
            {STRATEGIES.map((strat) => (
              <StrategyCard
                key={strat.id}
                option={strat}
                selected={strategyId === strat.id}
                onSelect={() => setStrategyId(strat.id)}
              />
            ))}
          </div>
        </ControlGroup>

        <ControlGroup label="Launch">
          <LaunchSummary
            airportCode={selectedCard?.airportCode ?? "—"}
            airportName={selectedCard?.airportName ?? ""}
            seatLabel={seatLabel}
            onStart={start}
          />
        </ControlGroup>
      </section>

      {/* Destination — takes all leftover vertical space below the controls. */}
      <section className="mt-4 flex min-h-0 flex-1 flex-col gap-2">
        <SectionHeading>Destination</SectionHeading>
        <div className="min-h-0 flex-1">
          <ScenarioPicker selectedSlug={scenarioSlug} onSelect={setScenarioSlug} />
        </div>
      </section>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

function SeatCard({
  option,
  selected,
  onSelect,
}: {
  option: SeatOption;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    // biome-ignore lint/correctness/noRestrictedElements: bespoke pick-tile chrome (accent stripe) — <Button> primary/secondary variants would override it
    <button
      type="button"
      onClick={onSelect}
      className={`group relative flex flex-col justify-center gap-1 overflow-hidden rounded-lg border bg-surface-800/60 px-3 py-2 text-left transition-all duration-150 ${
        selected
          ? "border-white/30 bg-surface-800 shadow-md"
          : "border-white/10 hover:bg-surface-800 hover:border-white/10"
      }`}
      style={{ borderLeftWidth: "4px", borderLeftColor: option.accentColor }}
      aria-pressed={selected}
    >
      <span className="text-sm font-bold text-white">{option.label}</span>
      <span className="text-3xs leading-tight text-fg-secondary">{option.description}</span>
    </button>
  );
}

function StrategyCard({
  option,
  selected,
  onSelect,
}: {
  option: StrategyOption;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    // biome-ignore lint/correctness/noRestrictedElements: bespoke pick-tile chrome (accent stripe, difficulty pill) — <Button> variants would override the styling
    <button
      type="button"
      onClick={onSelect}
      className={`group relative flex h-full flex-col gap-1 overflow-hidden rounded-lg border bg-surface-800/60 px-3 py-2 text-left transition-all duration-150 ${
        selected
          ? "border-white/30 bg-surface-800 shadow-md"
          : "border-white/10 hover:bg-surface-800 hover:border-white/10"
      }`}
      style={{ borderLeftWidth: "4px", borderLeftColor: option.accentColor }}
      aria-pressed={selected}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-white">{option.label}</span>
        <span
          className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ring-1 ring-inset ${option.badgeClass}`}
        >
          {option.difficulty}
        </span>
      </div>
      <span className="line-clamp-2 text-3xs leading-tight text-fg-secondary">
        {option.description}
      </span>
    </button>
  );
}

/**
 * Right-most block of the controls strip. Shows a compact summary of the
 * current selection so the Start button isn't an unanchored CTA — the
 * player can confirm where they're flying and from which seat at a glance,
 * then hit Launch. The button fills the height of the group.
 */
function LaunchSummary({
  airportCode,
  airportName,
  seatLabel,
  onStart,
}: {
  airportCode: string;
  airportName: string;
  seatLabel: string;
  onStart: () => void;
}) {
  return (
    <div className="flex h-full flex-col justify-between gap-2">
      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-base font-black tracking-wider text-white">
          {airportCode}
        </span>
        <span className="line-clamp-1 text-2xs text-fg-secondary">{airportName}</span>
        <span className="text-3xs text-fg-muted">Flying as {seatLabel}</span>
      </div>
      <Button variant="primary" size="lg" block onClick={onStart}>
        Start Flight
      </Button>
    </div>
  );
}
