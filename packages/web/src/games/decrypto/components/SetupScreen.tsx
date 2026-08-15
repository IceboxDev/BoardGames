import { DECRYPTO_AI_MODELS } from "@boardgames/core/games/decrypto/ai/models";
import { useState } from "react";
import { PvAISetupScreen, type StrategyOption } from "../../../components/setup";
import { Checkbox, SegmentedControl } from "../../../components/ui";

// The strategy axis IS the GPT model driving every AI seat — the id is passed
// verbatim as the OpenAI `model` parameter server-side.
const MODEL_STRATEGIES: StrategyOption[] = DECRYPTO_AI_MODELS.map((m) => ({
  id: m.id,
  label: m.label,
  description: m.description,
  difficulty: m.difficulty,
}));

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
      strategies={MODEL_STRATEGIES}
      defaultStrategy={DECRYPTO_AI_MODELS[DECRYPTO_AI_MODELS.length - 1]?.id}
      onStart={(_playerCount, modelId) => onStart(mode, modelId, timerEnabled)}
      extraControls={
        <div className="flex flex-col items-center gap-4">
          <SegmentedControl
            options={[
              { value: "standard", label: "2v2 — you + a GPT teammate" },
              { value: "interceptor", label: "Interceptor — you vs a GPT team" },
            ]}
            value={mode}
            onChange={setMode}
            selectionMode="toggle"
            size="sm"
          />
          <p className="max-w-md text-center text-3xs leading-snug text-fg-muted">
            {mode === "standard"
              ? "You and a GPT teammate hold four keywords against a full GPT team. You encrypt on odd rounds; your teammate encrypts on even ones."
              : "The official 3-player variant: a two-GPT team transmits codes and you intercept from their public clue history alone. Two tokens in five rounds wins."}
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
