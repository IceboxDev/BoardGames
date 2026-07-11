import { useState } from "react";
import type { StrategyOption } from "../../../components/setup";
import { PvAISetupScreen } from "../../../components/setup";
import { Chip } from "../../../components/ui";

const STRATEGIES: StrategyOption[] = [
  {
    id: "random",
    label: "Random",
    description: "Bots pick a random legal move — trades, wonders and all.",
    difficulty: "Easy",
    accentColor: "#22c55e",
    badgeClass: "bg-green-500/15 text-green-400 ring-green-500/30",
  },
];

interface SetupScreenProps {
  onStart: (playerCount: number, edifice: boolean) => void;
}

export default function SetupScreen({ onStart }: SetupScreenProps) {
  const [edifice, setEdifice] = useState(false);

  return (
    <PvAISetupScreen
      title="7 Wonders"
      playerCounts={[3, 4, 5, 6, 7]}
      strategies={STRATEGIES}
      defaultStrategy="random"
      onStart={(playerCount) => onStart(playerCount, edifice)}
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
