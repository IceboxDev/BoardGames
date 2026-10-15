import { codenamesManifest } from "@boardgames/core/games/codenames/manifest";
import { useState } from "react";
import { PvAISetupScreen } from "../../../components/setup";
import { SegmentedControl } from "../../../components/ui";
import { OptionsControls, type TableOptions } from "./OptionsControls";

export type SoloRole = "spymaster" | "operative";

export interface CodenamesSetup extends TableOptions {
  role: SoloRole;
  players: number;
  modelId: string;
}

// Solo: you play for Red — as its spymaster (an AI operative guesses) or as
// its operative (an AI spymaster clues for you) — against an all-AI Blue team.
// Always the four-seat table: extra AI operatives would only add seats to
// watch, never a decision for you (a bigger table is a room's choice).
export default function SetupScreen({ onStart }: { onStart: (setup: CodenamesSetup) => void }) {
  const [role, setRole] = useState<SoloRole>("operative");
  const [options, setOptions] = useState<TableOptions>({
    language: "en",
    clueTimerSec: 0,
    guessTimerSec: 0,
  });

  return (
    <PvAISetupScreen
      title="Codenames"
      manifest={codenamesManifest}
      playerCounts={[4]}
      onStart={(players, modelId) => onStart({ ...options, role, players, modelId })}
      extraControls={
        <div className="flex flex-col items-center gap-4">
          <SegmentedControl
            options={[
              { value: "operative", label: "Operative — guess your AI spymaster's clues" },
              { value: "spymaster", label: "Spymaster — clue your AI operatives" },
            ]}
            value={role}
            onChange={setRole}
            selectionMode="toggle"
            size="sm"
          />
          <OptionsControls value={options} onChange={setOptions} />
        </div>
      }
    />
  );
}
