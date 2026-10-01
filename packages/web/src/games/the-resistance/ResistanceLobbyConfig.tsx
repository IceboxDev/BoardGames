import {
  type ResistanceConfig,
  resistanceManifest,
} from "@boardgames/core/games/the-resistance/manifest";
import { configOrDefaults } from "@boardgames/core/machines/manifest";
import { CheckRow, FieldGroup } from "../../components/ui";
import type { LobbyConfigProps } from "../types";

// The table's variants — `{ targeting, blindSpies, liveSolver }`, the manifest's
// config. The server parses the host's value with the same schema on Start.

function read(value: unknown): ResistanceConfig {
  return configOrDefaults(resistanceManifest, value);
}

export default function ResistanceLobbyConfig({
  value,
  onChange,
  isHost = true,
}: LobbyConfigProps) {
  const cfg = read(value);
  const set = (patch: Partial<ResistanceConfig>) => onChange({ ...cfg, ...patch });
  return (
    <FieldGroup label="Table rules">
      <div className="flex flex-col gap-2">
        <CheckRow
          checked={cfg.liveSolver}
          disabled={!isHost}
          onChange={() => set({ liveSolver: !cfg.liveSolver })}
          title="Live Solver"
          description="Everyone sees spy odds and proofs from their own point of view while playing."
        />
        <CheckRow
          checked={cfg.targeting}
          disabled={!isHost}
          onChange={() => set({ targeting: !cfg.targeting })}
          title="Targeting"
          description="The leader picks which mission to attempt. Mission 5 opens after two successes."
        />
        <CheckRow
          checked={cfg.blindSpies}
          disabled={!isHost}
          onChange={() => set({ blindSpies: !cfg.blindSpies })}
          title="Blind Spies"
          description="No spy reveal — spies don't know each other."
        />
      </div>
    </FieldGroup>
  );
}
