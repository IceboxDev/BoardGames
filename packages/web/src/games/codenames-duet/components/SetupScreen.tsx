import {
  duetManifest,
  STANDARD_TOKENS,
  TOKEN_OPTIONS,
} from "@boardgames/core/games/codenames-duet/manifest";
import { useState } from "react";
import { PvAISetupScreen } from "../../../components/setup";
import { MicroLabel, Select } from "../../../components/ui";
import { OptionsControls, type TableOptions } from "../../codenames/components/OptionsControls";

export interface DuetSetup extends TableOptions {
  timerTokens: number;
  modelId: string;
}

export function TokenSelect({
  value,
  onChange,
  disabled = false,
}: {
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <MicroLabel>Turns (timer tokens)</MicroLabel>
      <Select
        size="sm"
        value={String(value)}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {TOKEN_OPTIONS.map((n) => (
          <option key={n} value={n}>
            {n}
            {n === STANDARD_TOKENS
              ? " (standard)"
              : n < STANDARD_TOKENS
                ? " (harder)"
                : " (easier)"}
          </option>
        ))}
      </Select>
    </div>
  );
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
