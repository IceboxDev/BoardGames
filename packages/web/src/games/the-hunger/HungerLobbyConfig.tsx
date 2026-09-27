import { theHungerManifest } from "@boardgames/core/games/the-hunger/manifest";
import { configOrDefaults } from "@boardgames/core/machines/manifest";
import type { LobbyConfigProps } from "../types";
import { ModeControls } from "./components/SetupScreen";

/** Elder / Rookie and the beginner Mountains house rule, in the room lobby. */
export default function HungerLobbyConfig({ value, onChange }: LobbyConfigProps) {
  const config = configOrDefaults(theHungerManifest, value);
  return (
    <div className="mx-auto mb-4 w-full max-w-md">
      <ModeControls
        mode={config.mode}
        onMode={(mode) => onChange({ ...config, mode })}
        safe={config.beginnerSafeMountains}
        onSafe={(beginnerSafeMountains) => onChange({ ...config, beginnerSafeMountains })}
      />
    </div>
  );
}
