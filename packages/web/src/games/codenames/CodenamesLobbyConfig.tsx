import { codenamesManifest } from "@boardgames/core/games/codenames/manifest";
import { configOrDefaults } from "@boardgames/core/machines/manifest";
import type { LobbyConfigProps } from "../types";
import { OptionsControls } from "./components/OptionsControls";

// Codenames' lobby options. Teams and spymasters are NOT chosen here: they
// follow the seats above (Red/Blue Spymaster first, then alternating
// operatives) — take a bot's seat or ask the host to swap or shuffle.

export default function CodenamesLobbyConfig({ value, onChange, isHost }: LobbyConfigProps) {
  const config = configOrDefaults(codenamesManifest, value);
  return (
    <div className="mx-auto mb-6 flex w-full max-w-md flex-col gap-2">
      <OptionsControls value={config} onChange={onChange} disabled={!isHost} />
      <p className="text-center text-3xs leading-snug text-fg-muted">
        Seats decide teams: the first two are the Red and Blue spymasters, the rest alternate Red
        and Blue operatives. Swap into a bot's seat, or let the host shuffle.
      </p>
    </div>
  );
}
