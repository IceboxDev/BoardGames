import { duetManifest } from "@boardgames/core/games/codenames-duet/manifest";
import { configOrDefaults } from "@boardgames/core/machines/manifest";
import { OptionsControls } from "../codenames/components/OptionsControls";
import type { LobbyConfigProps } from "../types";
import { TokenSelect } from "./components/SetupScreen";

export default function DuetLobbyConfig({ value, onChange, isHost }: LobbyConfigProps) {
  const config = configOrDefaults(duetManifest, value);
  return (
    <div className="mx-auto mb-6 flex w-full max-w-md flex-col items-center gap-3">
      <OptionsControls
        value={config}
        onChange={(next) => onChange({ ...config, ...next })}
        disabled={!isHost}
      />
      <TokenSelect
        value={config.timerTokens}
        disabled={!isHost}
        onChange={(timerTokens) => onChange({ ...config, timerTokens })}
      />
    </div>
  );
}
