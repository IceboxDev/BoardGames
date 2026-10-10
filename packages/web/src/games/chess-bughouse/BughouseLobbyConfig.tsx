import { bughouseManifest } from "@boardgames/core/games/chess-bughouse/manifest";
import { configOrDefaults } from "@boardgames/core/machines/manifest";
import { Eyebrow } from "../../components/ui";
import { TimeControlPicker } from "../chess/components/TimeControlPicker";
import type { LobbyConfigProps } from "../types";

/**
 * The room's clock. Seats are the teams: seats 1 and 4 (A-White, B-Black)
 * play against seats 2 and 3 — swap seats to pick partners.
 */
export default function BughouseLobbyConfig({ value, onChange, isHost = true }: LobbyConfigProps) {
  const config = configOrDefaults(bughouseManifest, value);
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
      <p className="text-xs text-fg-muted">
        Teams: Board A White + Board B Black against Board A Black + Board B White. Swap seats to
        choose partners.
      </p>
    </div>
  );
}
