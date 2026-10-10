import { goManifest } from "@boardgames/core/games/go/manifest";
import { useState } from "react";
import { ControlGroup, PvAISetupScreen } from "../../../components/setup";
import { SegmentedControl } from "../../../components/ui";
import { DEFAULT_OPTIONS, type GoOptionsValue } from "../logic/options";
import GoOptions from "./GoOptions";

export type ColorChoice = "black" | "white" | "random";

export interface GoSoloSetup {
  readonly strategy: string;
  readonly color: ColorChoice;
  readonly options: GoOptionsValue;
}

export default function SetupScreen({ onStart }: { onStart: (setup: GoSoloSetup) => void }) {
  const [options, setOptions] = useState<GoOptionsValue>(DEFAULT_OPTIONS);
  const [color, setColor] = useState<ColorChoice>("black");
  return (
    <PvAISetupScreen
      title="Go"
      manifest={goManifest}
      onStart={(_n, strategy) => onStart({ strategy, color, options })}
      extraControls={
        <div className="flex flex-col gap-3">
          <ControlGroup label="You play">
            <SegmentedControl<ColorChoice>
              options={[
                { value: "black", label: "● Black" },
                { value: "white", label: "○ White" },
                { value: "random", label: "Random" },
              ]}
              value={color}
              onChange={setColor}
              size="sm"
              fullWidth
              aria-label="Your colour"
            />
          </ControlGroup>
          <GoOptions value={options} onChange={setOptions} />
        </div>
      }
    />
  );
}
