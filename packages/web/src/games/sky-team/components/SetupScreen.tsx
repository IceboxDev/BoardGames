import { useState } from "react";
import { OptionCard, SectionLabel, SetupHeader, SetupLayout } from "../../../components/setup";
import { Button } from "../../../components/ui/Button";

export interface SkyTeamStartConfig {
  scenarioId: string;
  humanPlayers: number[];
  aiStrategy: string;
}

interface Props {
  onStart: (config: SkyTeamStartConfig) => void;
}

interface ScenarioOption {
  id: string;
  name: string;
  note: string;
  accentColor: string;
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

const SCENARIOS: ScenarioOption[] = [
  { id: "yul-montreal", name: "YUL Montréal-Trudeau", note: "Base game", accentColor: "#38bdf8" },
];

const SEATS: SeatOption[] = [
  {
    id: 0,
    label: "Pilot",
    description: "Blue side; places first each round.",
    accentColor: "#38bdf8",
  },
  { id: 1, label: "Co-Pilot", description: "Orange side; deploys flaps.", accentColor: "#f97316" },
];

const STRATEGIES: StrategyOption[] = [
  {
    id: "heuristic-v1",
    label: "Heuristic",
    description:
      "Rule-based AI: prefers safe placements, advances tracks under pressure, spends coffee only to avoid crashes.",
    difficulty: "Medium",
    accentColor: "#f59e0b",
    badgeClass: "bg-amber-500/15 text-amber-400 ring-amber-500/30",
  },
];

export default function SetupScreen({ onStart }: Props) {
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id);
  const [seat, setSeat] = useState<0 | 1>(0);
  const [strategyId, setStrategyId] = useState(STRATEGIES[0].id);

  const start = () => {
    onStart({ scenarioId, humanPlayers: [seat], aiStrategy: strategyId });
  };

  const totalStars = STRATEGIES.length;

  return (
    <SetupLayout>
      <SetupHeader title="Sky Team" subtitle="Choose your seat and AI opponent" />

      {SCENARIOS.length > 1 && (
        <div className="mb-8 w-full max-w-6xl">
          <SectionLabel>Scenario</SectionLabel>
          <div className="grid grid-cols-1 gap-2 sm:gap-4 sm:grid-cols-2">
            {SCENARIOS.map((s) => (
              <OptionCard
                key={s.id}
                accentColor={s.accentColor}
                selected={scenarioId === s.id}
                onClick={() => setScenarioId(s.id)}
              >
                <span className="mb-0.5 block text-[11px] font-bold leading-tight text-white sm:mb-1 sm:text-lg">
                  {s.name}
                </span>
                <span className="text-[9px] leading-snug text-gray-400 sm:text-sm">{s.note}</span>
              </OptionCard>
            ))}
          </div>
        </div>
      )}

      <div className="mb-8 w-full max-w-6xl">
        <SectionLabel>Your seat (AI takes the other)</SectionLabel>
        <div className="grid w-full grid-cols-2 gap-2 sm:gap-4">
          {SEATS.map((opt) => (
            <OptionCard
              key={opt.id}
              accentColor={opt.accentColor}
              selected={seat === opt.id}
              onClick={() => setSeat(opt.id)}
            >
              <span className="mb-0.5 block text-[11px] font-bold leading-tight text-white sm:mb-1 sm:text-lg">
                {opt.label}
              </span>
              <span className="text-[9px] leading-snug text-gray-400 sm:text-sm">
                {opt.description}
              </span>
            </OptionCard>
          ))}
        </div>
      </div>

      <SectionLabel>Choose your opponent</SectionLabel>

      <div className="mb-8 grid w-full min-w-0 max-w-6xl grid-cols-1 gap-2 sm:gap-4">
        {STRATEGIES.map((strat, index) => {
          const stars = index + 1;
          return (
            <OptionCard
              key={strat.id}
              accentColor={strat.accentColor}
              selected={strategyId === strat.id}
              className="min-w-0 !px-2 !py-3 sm:!px-4 sm:!py-5"
              onClick={() => setStrategyId(strat.id)}
            >
              <div className="mb-1.5 flex items-start justify-between gap-0.5 sm:mb-3">
                <span
                  className={`inline-flex max-w-[4.5rem] items-center truncate rounded-full px-1 py-0.5 text-[8px] font-semibold uppercase tracking-tight ring-1 ring-inset sm:max-w-none sm:px-2.5 sm:text-[10px] sm:tracking-wider ${strat.badgeClass}`}
                >
                  {strat.difficulty}
                </span>
                <div className="flex shrink-0 gap-px sm:gap-0.5">
                  {Array.from({ length: totalStars }, (_, i) => i + 1).map((n) => (
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

              <span className="mb-0.5 block text-[11px] font-bold leading-tight text-white sm:mb-1 sm:text-lg">
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
        <Button variant="primary" size="lg" onClick={start}>
          Start Game
        </Button>
      </div>
    </SetupLayout>
  );
}
