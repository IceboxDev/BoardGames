import {
  type AIStrategyId,
  ALL_STRATEGIES,
  type Mode,
} from "@boardgames/core/games/the-hunger/types";
import { useState } from "react";
import { ControlGroup, PvAISetupScreen, type StrategyOption } from "../../../components/setup";
import { Checkbox, SegmentedControl } from "../../../components/ui";

const DIFFICULTY: Record<AIStrategyId, StrategyOption["difficulty"]> = {
  random: "Easy",
  "heuristic-v1": "Medium",
};

const STRATEGIES: StrategyOption[] = [...ALL_STRATEGIES].reverse().map((s) => ({
  id: s.id,
  label: s.label,
  description: s.description,
  difficulty: DIFFICULTY[s.id],
}));

export interface SoloSetup {
  playerCount: number;
  strategy: AIStrategyId;
  mode: Mode;
  beginnerSafeMountains: boolean;
}

interface Props {
  onStart: (setup: SoloSetup) => void;
}

export default function SetupScreen({ onStart }: Props) {
  const [mode, setMode] = useState<Mode>("elder");
  const [safe, setSafe] = useState(false);
  return (
    <PvAISetupScreen
      title="The Hunger"
      playerCounts={[2, 3, 4, 5, 6]}
      defaultPlayerCount={3}
      strategies={STRATEGIES}
      defaultStrategy="heuristic-v1"
      onStart={(playerCount, id) =>
        onStart({ playerCount, strategy: id as AIStrategyId, mode, beginnerSafeMountains: safe })
      }
      extraControls={<ModeControls mode={mode} onMode={setMode} safe={safe} onSafe={setSafe} />}
    />
  );
}

export function ModeControls({
  mode,
  onMode,
  safe,
  onSafe,
}: {
  mode: Mode;
  onMode: (mode: Mode) => void;
  safe: boolean;
  onSafe: (safe: boolean) => void;
}) {
  return (
    <ControlGroup label="Mode">
      <div className="flex flex-col gap-2">
        <SegmentedControl
          aria-label="Game mode"
          options={[
            {
              value: "elder",
              label: "Elder",
              title: "Board side B — end in the Castle or Cemetery",
            },
            {
              value: "rookie",
              label: "Rookie",
              title: "Board side A — the Mountains are safe too",
            },
          ]}
          value={mode}
          onChange={onMode}
        />
        {mode === "elder" && (
          <Checkbox
            checked={safe}
            onChange={(e) => onSafe(e.target.checked)}
            label="Beginners are safe in the Mountains"
          />
        )}
      </div>
    </ControlGroup>
  );
}
