import { decryptoManifest } from "@boardgames/core/games/decrypto/manifest";
import { useState } from "react";
import { PvAISetupScreen } from "../../../components/setup";
import { Checkbox, SegmentedControl } from "../../../components/ui";

// The strategy axis is the AI difficulty tier driving every AI seat — the
// server maps the tier id to a concrete provider model (env-configurable).

export type SoloMode = "standard" | "interceptor";

export default function SetupScreen({
  onStart,
}: {
  onStart: (mode: SoloMode, modelId: string, timerEnabled: boolean) => void;
}) {
  const [mode, setMode] = useState<SoloMode>("standard");
  const [timerEnabled, setTimerEnabled] = useState(false);

  return (
    <PvAISetupScreen
      title="Decrypto"
      manifest={decryptoManifest}
      // The table size follows the mode below, not a stepper.
      playerCounts={[mode === "interceptor" ? 3 : 4]}
      onStart={(_playerCount, modelId) => onStart(mode, modelId, timerEnabled)}
      extraControls={
        <div className="flex flex-col items-center gap-4">
          <SegmentedControl
            options={[
              { value: "standard", label: "2v2 — you + an AI teammate" },
              { value: "interceptor", label: "Interceptor — you vs an AI team" },
            ]}
            value={mode}
            onChange={setMode}
            selectionMode="toggle"
            size="sm"
          />
          <p className="max-w-md text-center text-3xs leading-snug text-fg-muted">
            {mode === "standard"
              ? "You and an AI teammate hold four keywords against a full AI team. You encrypt on odd rounds; your teammate encrypts on even ones."
              : "The official 3-player variant: a two-AI team transmits codes and you intercept from their public clue history alone. Two tokens in five rounds wins."}
          </p>
          <Checkbox
            label="30-second clue timer"
            checked={timerEnabled}
            onChange={(e) => setTimerEnabled(e.target.checked)}
          />
        </div>
      }
    />
  );
}
