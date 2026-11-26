import { skyTeamManifest } from "@boardgames/core/games/sky-team/manifest";
import { useMemo, useState } from "react";
import { SetupBriefing, SetupFooter, SetupOptions, SetupSection } from "../../../components/setup";
import { SegmentedControl } from "../../../components/ui/SegmentedControl";
import { SCENARIO_CARDS } from "../scenarios";
import ScenarioPicker from "./ScenarioPicker";

/** A solo flight: the scenario, the seat you fly and your AI partner. */
export interface SkyTeamSoloSetup {
  scenarioId: string;
  seat: 0 | 1;
  strategy: string;
}

interface Props {
  onStart: (setup: SkyTeamSoloSetup) => void;
}

const SEAT_NOTE: Record<0 | 1, string> = {
  0: "Blue side · deploys the landing gear.",
  1: "Orange side · deploys the flaps.",
};

const STRATEGIES = skyTeamManifest.strategies;

const DEFAULT_SCENARIO_SLUG = SCENARIO_CARDS.find((s) => s.backendId != null)?.slug ?? "yul-green";

/**
 * Sky Team's briefing. The destination gallery is the screen's big choice,
 * so it takes the leftover height under the options; your AI partner and
 * your seat sit in the options panel. Fits the screen without scrolling.
 */
export default function SetupScreen({ onStart }: Props) {
  const [scenarioSlug, setScenarioSlug] = useState(DEFAULT_SCENARIO_SLUG);
  const [seat, setSeat] = useState<0 | 1>(0);
  const [strategyId, setStrategyId] = useState(STRATEGIES[0]?.id ?? "");

  const selectedCard = useMemo(
    () => SCENARIO_CARDS.find((s) => s.slug === scenarioSlug),
    [scenarioSlug],
  );
  const partner = STRATEGIES.find((s) => s.id === strategyId);

  const start = () => {
    const backendId = selectedCard?.backendId ?? "yul-montreal";
    onStart({ scenarioId: backendId, seat, strategy: strategyId });
  };

  return (
    <SetupBriefing
      title="Sky Team"
      eyebrow="Solo · you + an AI co-pilot"
      footer={
        <SetupFooter
          summary={`${selectedCard?.airportCode ?? "—"} ${selectedCard?.airportName ?? ""} · flying as ${seat === 0 ? "Pilot" : "Co-Pilot"} · ${partner?.label ?? ""} partner`}
          startLabel="Start flight"
          onStart={start}
        />
      }
    >
      <SetupOptions
        options={[
          {
            id: "partner",
            label: "AI partner",
            span: "l",
            note: partner?.description,
            control: (
              <SegmentedControl<string>
                aria-label="AI partner"
                options={STRATEGIES.map((s) => ({ value: s.id, label: s.label }))}
                value={strategyId}
                onChange={setStrategyId}
                size="sm"
              />
            ),
          },
          {
            id: "seat",
            label: "Your seat",
            span: "l",
            note: SEAT_NOTE[seat],
            control: (
              <SegmentedControl<0 | 1>
                aria-label="Your seat"
                options={[
                  { value: 0, label: "Pilot" },
                  { value: 1, label: "Co-Pilot" },
                ]}
                value={seat}
                onChange={setSeat}
                size="sm"
              />
            ),
          },
        ]}
      />
      <SetupSection label="Destination" grow>
        <div className="min-h-64 flex-1 lg:min-h-0">
          <ScenarioPicker selectedSlug={scenarioSlug} onSelect={setScenarioSlug} />
        </div>
      </SetupSection>
    </SetupBriefing>
  );
}
