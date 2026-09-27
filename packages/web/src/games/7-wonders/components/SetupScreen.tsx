import { sevenWondersManifest } from "@boardgames/core/games/7-wonders/manifest";
import { useState } from "react";
import { PvAISetupScreen } from "../../../components/setup";
import { Chip } from "../../../components/ui";

interface SetupScreenProps {
  onStart: (setup: { playerCount: number; strategy: string; edifice: boolean }) => void;
}

export default function SetupScreen({ onStart }: SetupScreenProps) {
  const [edifice, setEdifice] = useState(false);

  return (
    <PvAISetupScreen
      title="7 Wonders"
      manifest={sevenWondersManifest}
      onStart={(playerCount, strategy) => onStart({ playerCount, strategy, edifice })}
      extraControls={
        <div className="flex flex-col items-center gap-1.5">
          <Chip
            pressed={edifice}
            tone="amber"
            variant="outlined"
            size="md"
            onClick={() => setEdifice((v) => !v)}
          >
            🏛 Edifice expansion{edifice ? " · on" : ""}
          </Chip>
          <span className="max-w-xs text-center text-2xs text-fg-secondary">
            Co-fund communal projects while building your Wonder for shared rewards — or a penalty
            if they fail.
          </span>
        </div>
      }
    />
  );
}
