import type { Mode } from "@boardgames/core/games/the-hunger/types";
import type { LobbyConfigProps } from "../types";
import { ModeControls } from "./components/SetupScreen";

function read(value: unknown): { mode: Mode; beginnerSafeMountains: boolean } {
  const v = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    mode: v.mode === "rookie" ? "rookie" : "elder",
    beginnerSafeMountains: v.beginnerSafeMountains === true,
  };
}

/** Elder / Rookie and the beginner Mountains house rule, in the room lobby. */
export default function HungerLobbyConfig({ value, onChange }: LobbyConfigProps) {
  const config = read(value);
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
