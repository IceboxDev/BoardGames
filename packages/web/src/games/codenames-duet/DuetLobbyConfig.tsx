import { duetManifest } from "@boardgames/core/games/codenames-duet/manifest";
import { configOrDefaults } from "@boardgames/core/machines/manifest";
import { OptionsControls } from "../codenames/components/OptionsControls";
import type { LobbyConfigProps } from "../types";
import { cityName, missionNumbers, missionRule } from "./campaign/mission-copy";
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
      {config.campaign ? (
        <div className="flex w-full flex-col items-center gap-1 rounded-card-lg border border-accent-400/30 bg-accent-500/10 px-4 py-3 text-center">
          <span className="text-2xs font-bold uppercase tracking-label text-accent-300">
            Campaign mission
          </span>
          <span className="font-card text-xl font-bold text-fg-strong">
            {cityName(config.campaign.city)}{" "}
            <span className="text-accent-300 tabular-nums">
              {missionNumbers(config.campaign.city)}
            </span>
          </span>
          <span className="text-xs text-fg-secondary">{missionRule(config.campaign.city)}</span>
        </div>
      ) : (
        <TokenSelect
          value={config.timerTokens}
          disabled={!isHost}
          onChange={(timerTokens) => onChange({ ...config, timerTokens })}
        />
      )}
    </div>
  );
}
