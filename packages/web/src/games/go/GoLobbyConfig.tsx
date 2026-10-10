import type { LobbyConfigProps } from "../types";
import GoOptions from "./components/GoOptions";
import { fromConfig, toConfig } from "./logic/options";

/**
 * Room options. Colours follow the seats — seat 1 plays Black — so the host
 * picks who is Black by swapping seats in the lobby.
 */
export default function GoLobbyConfig({ value, onChange, isHost }: LobbyConfigProps) {
  const options = fromConfig(value);
  if (isHost === false) {
    return (
      <p className="text-sm text-fg-secondary">
        The host is choosing the board and clock. The first seat plays Black.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <GoOptions value={options} onChange={(next) => onChange(toConfig(next))} />
      <p className="text-xs text-fg-muted">
        The first seat plays Black — swap seats to change colours.
      </p>
    </div>
  );
}
