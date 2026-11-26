import { goManifest } from "@boardgames/core/games/go/manifest";
import { useState } from "react";
import { PvAISetupScreen } from "../../../components/setup";
import { SegmentedControl } from "../../../components/ui";
import { DEFAULT_OPTIONS, type GoOptionsValue } from "../logic/options";
import { goOptionFields } from "./GoOptions";

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
      eyebrow="Solo · against the AI"
      summary={({ strategy }) =>
        `${color === "random" ? "Random colour" : color === "black" ? "Black" : "White"} · vs ${strategy?.label ?? ""} · ${options.size}×${options.size}${options.handicap ? ` · ${options.handicap} stones` : ""}`
      }
      onStart={(_n, strategy) => onStart({ strategy, color, options })}
      options={[
        {
          id: "colour",
          label: "You play",
          span: "s",
          control: (
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
          ),
        },
        ...goOptionFields({ value: options, onChange: setOptions }),
      ]}
    />
  );
}
