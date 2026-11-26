import { duetManifest, STANDARD_TOKENS } from "@boardgames/core/games/codenames-duet/manifest";
import { useState } from "react";
import { PvAISetupScreen } from "../../../components/setup";
import { type TableOptions, tableOptionFields } from "../../codenames/table";
import { TOKENS_LABEL, TokenSelectControl } from "./TokenSelect";

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
      eyebrow="Solo · you + an AI partner"
      fileWord="File"
      stamp="Assigned"
      summary={({ strategy }) => `Partner: ${strategy?.label ?? ""} · ${timerTokens} turns`}
      onStart={(_players, modelId) => onStart({ ...options, timerTokens, modelId })}
      options={[
        ...tableOptionFields(options, setOptions),
        {
          id: "tokens",
          label: TOKENS_LABEL,
          control: <TokenSelectControl value={timerTokens} onChange={setTimerTokens} />,
        },
      ]}
    />
  );
}
