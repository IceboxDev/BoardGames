import { theHungerManifest } from "@boardgames/core/games/the-hunger/manifest";
import type { Mode } from "@boardgames/core/games/the-hunger/types";
import { useState } from "react";
import { ControlGroup, PvAISetupScreen, type SetupOption } from "../../../components/setup";
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
      eyebrow="Solo · one night until sunrise"
      startLabel="Start the hunt"
      summary={({ playerCount, strategy }) =>
        `${playerCount} players · ${playerCount - 1} × ${strategy?.label ?? ""} · ${mode === "elder" ? `Elder${safe ? ", Beginners safe" : ""}` : "Rookie"}`
      }
      onStart={(playerCount, strategy) =>
        onStart({ playerCount, strategy, mode, beginnerSafeMountains: safe })
      }
      options={modeFields({ mode, onMode: setMode, safe, onSafe: setSafe })}
    />
  );
}

type ModeProps = {
  mode: Mode;
  onMode: (mode: Mode) => void;
  safe: boolean;
  onSafe: (safe: boolean) => void;
};

/** Mode and the Beginners rule as option fields — the solo setup lays them out. */
export function modeFields({ mode, onMode, safe, onSafe }: ModeProps): SetupOption[] {
  return [
    {
      id: "mode",
      label: "Mode",
      span: "m",
      note:
        mode === "elder"
          ? "Board side B — end in the Castle or Cemetery."
          : "Board side A — the Mountains are safe too.",
      control: (
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
      ),
    },
    {
      id: "safe",
      label: "Beginners",
      span: "m",
      disabled: mode !== "elder",
      note: mode === "elder" ? null : "Rookie's Mountains are always safe.",
      control: (
        <Checkbox
          checked={mode === "elder" && safe}
          disabled={mode !== "elder"}
          onChange={(e) => onSafe(e.target.checked)}
          label="Beginners are safe in the Mountains"
        />
      ),
    },
  ];
}

/** The same fields in one labelled group — the room lobby's layout (the rule only in Elder). */
export function ModeControls(props: ModeProps) {
  const [mode, safe] = modeFields(props);
  return (
    <ControlGroup label="Mode">
      <div className="flex flex-col gap-2">
        {mode?.control}
        {props.mode === "elder" && safe?.control}
      </div>
    </ControlGroup>
  );
}
