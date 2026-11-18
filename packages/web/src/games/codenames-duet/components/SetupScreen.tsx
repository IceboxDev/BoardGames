import { duetManifest, STANDARD_TOKENS } from "@boardgames/core/games/codenames-duet/manifest";
import { useState } from "react";
import { PvAISetupScreen } from "../../../components/setup";
import { OptionsControls, type TableOptions } from "../../codenames/table";
import { TokenSelect } from "./TokenSelect";

export interface DuetSetup extends TableOptions {
  timerTokens: number;
  modelId: string;
}

// Solo Duet: you and an AI partner, each holding one side of the key.
export default function SetupScreen({ onStart }: { onStart: (setup: DuetSetup) => void }) {
  const [options, setOptions] = useState<TableOptions>({
    language: "en",
    clueTimerSec: 0,
    guessTimerSec: 0,
  });
  const [timerTokens, setTimerTokens] = useState<number>(STANDARD_TOKENS);
  return (
    <PvAISetupScreen
      title="Codenames: Duet"
      manifest={duetManifest}
      playerCounts={[2]}
      onStart={(_players, modelId) => onStart({ ...options, timerTokens, modelId })}
      extraControls={
        <div className="flex flex-col items-center gap-3">
          <OptionsControls value={options} onChange={setOptions} />
          <TokenSelect value={timerTokens} onChange={setTimerTokens} />
        </div>
      }
    />
  );
}
