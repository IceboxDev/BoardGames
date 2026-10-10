import { chessManifest } from "@boardgames/core/games/chess/manifest";
import type { TimeControl } from "@boardgames/core/games/chess/schemas";
import { useState } from "react";
import { PvAISetupScreen } from "../../../components/setup/PvAISetupScreen";
import { SectionLabel } from "../../../components/setup/SectionLabel";
import { Checkbox, SegmentedControl } from "../../../components/ui";
import { TimeControlPicker } from "./TimeControlPicker";

export type ColorChoice = "w" | "random" | "b";

export interface ChessSetup {
  readonly strategy: string;
  readonly color: ColorChoice;
  readonly timeControl: TimeControl | null;
  readonly takebacks: boolean;
}

/** Solo setup: the AI ladder, plus colour, clock and takebacks. */
export default function SetupScreen({ onStart }: { onStart: (setup: ChessSetup) => void }) {
  const [color, setColor] = useState<ColorChoice>("w");
  const [timeControl, setTimeControl] = useState<TimeControl | null>(null);
  const [takebacks, setTakebacks] = useState(true);

  return (
    <PvAISetupScreen
      title="Chess"
      manifest={chessManifest}
      onStart={(_n, strategy) => onStart({ strategy, color, timeControl, takebacks })}
      extraControls={
        <div className="mb-8 flex w-full max-w-3xl flex-col gap-6">
          <div>
            <SectionLabel>Play as</SectionLabel>
            <SegmentedControl<ColorChoice>
              aria-label="Your colour"
              value={color}
              onChange={setColor}
              options={[
                { value: "w", label: "♔ White" },
                { value: "random", label: "Random" },
                { value: "b", label: "♚ Black" },
              ]}
            />
          </div>
          <div>
            <SectionLabel>Time control</SectionLabel>
            <TimeControlPicker value={timeControl} onChange={setTimeControl} />
          </div>
          <Checkbox
            checked={takebacks}
            onChange={(e) => setTakebacks(e.target.checked)}
            label="Allow takebacks"
          />
        </div>
      }
    />
  );
}
