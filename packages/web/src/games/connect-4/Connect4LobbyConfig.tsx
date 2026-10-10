import { connect4Manifest } from "@boardgames/core/games/connect-4/manifest";
import { configOrDefaults } from "@boardgames/core/machines/manifest";
import type { LobbyConfigProps } from "../types";
import { ConfigControls } from "./components/ConfigControls";

// The table's options — the manifest's config. The server parses the host's
// value with the same schema on Start.

export default function Connect4LobbyConfig({ value, onChange, isHost = true }: LobbyConfigProps) {
  return (
    <ConfigControls
      value={configOrDefaults(connect4Manifest, value)}
      onChange={onChange}
      disabled={!isHost}
      openerLabels={{ seat0: "Red", seat1: "Yellow" }}
    />
  );
}
