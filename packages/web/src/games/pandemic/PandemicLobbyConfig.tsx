import { type PandemicConfig, pandemicManifest } from "@boardgames/core/games/pandemic/manifest";
import { configOrDefaults } from "@boardgames/core/machines/manifest";
import { Chip } from "../../components/ui/Chip";
import type { LobbyConfigProps } from "../types";

type Difficulty = PandemicConfig["difficulty"];

const OPTIONS: Difficulty[] = [4, 5, 6];

function label(d: Difficulty): string {
  if (d === 4) return "Intro";
  if (d === 5) return "Standard";
  return "Heroic";
}

/**
 * Difficulty picker shown inside the Pandemic multiplayer lobby. Wired
 * into the lobby route via `def.lobbyConfigComponent` — the route holds
 * the current config object and threads it into `mp.startRoom(config)`
 * when the host clicks Start. Pure presentational: the route owns the
 * state, this component just renders three chips and reports clicks.
 */
export default function PandemicLobbyConfig({ value, onChange }: LobbyConfigProps) {
  const { difficulty } = configOrDefaults(pandemicManifest, value);

  return (
    <div className="mx-auto mb-4 w-full max-w-md">
      <div className="mb-2 text-xs font-medium uppercase tracking-wider text-fg-secondary">
        Difficulty
      </div>
      <div className="flex gap-2">
        {OPTIONS.map((d) => (
          <Chip
            key={d}
            pressed={difficulty === d}
            tone="emerald"
            variant="outlined"
            size="md"
            block
            onClick={() => onChange({ difficulty: d })}
            className="flex-1"
          >
            {label(d)}
          </Chip>
        ))}
      </div>
    </div>
  );
}
