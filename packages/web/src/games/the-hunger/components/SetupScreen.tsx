import { theHungerManifest } from "@boardgames/core/games/the-hunger/manifest";
import type { Mode } from "@boardgames/core/games/the-hunger/types";
import { useState } from "react";
import { ControlGroup, PvAISetupScreen } from "../../../components/setup";
import { Checkbox, SegmentedControl } from "../../../components/ui";

export interface SoloSetup {
  playerCount: number;
  strategy: string;
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
      manifest={theHungerManifest}
      defaultPlayerCount={3}
      onStart={(playerCount, strategy) =>
        onStart({ playerCount, strategy, mode, beginnerSafeMountains: safe })
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
