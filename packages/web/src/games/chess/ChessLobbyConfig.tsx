import { chessManifest } from "@boardgames/core/games/chess/manifest";
import { configOrDefaults } from "@boardgames/core/machines/manifest";
import { Checkbox, Eyebrow } from "../../components/ui";
import type { LobbyConfigProps } from "../types";
import { TimeControlPicker } from "./components/TimeControlPicker";

/**
 * The room's clock and takeback rule, chosen by the host. Colours follow the
 * seats: the first seat plays White, and the host swaps seats to change it.
 */
export default function ChessLobbyConfig({ value, onChange, isHost = true }: LobbyConfigProps) {
  const config = configOrDefaults(chessManifest, value);
  return (
    <div className="mx-auto mb-4 flex w-full max-w-2xl flex-col gap-4">
      <div>
        <Eyebrow as="h3" size="sm" tone="neutral" className="mb-2">
          Time control
        </Eyebrow>
        <TimeControlPicker
          value={config.timeControl}
          onChange={(timeControl) => onChange({ ...config, timeControl })}
          disabled={!isHost}
        />
      </div>
      <Checkbox
        checked={config.takebacks}
        disabled={!isHost}
        onChange={(e) => onChange({ ...config, takebacks: e.target.checked })}
        label="Allow takebacks (your opponent must agree)"
      />
      <p className="text-xs text-fg-muted">
        The first seat plays White — swap seats to switch colours.
      </p>
    </div>
  );
}
