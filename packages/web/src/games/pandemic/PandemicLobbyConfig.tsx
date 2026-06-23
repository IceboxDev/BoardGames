import { Chip } from "../../components/ui/Chip";
import type { LobbyConfigProps } from "../types";

type Difficulty = 4 | 5 | 6;

const OPTIONS: Difficulty[] = [4, 5, 6];

function label(d: Difficulty): string {
  if (d === 4) return "Intro";
  if (d === 5) return "Standard";
  return "Heroic";
}

function readDifficulty(value: unknown): Difficulty {
  // The lobby route owns the config state and seeds it from
  // `GameDefinition.defaultMpConfig` (`{ difficulty: 4 }`). We narrow it
  // here so a host returning to the lobby with a previously-picked
  // difficulty keeps the same chip pressed.
  if (value && typeof value === "object" && "difficulty" in value) {
    const d = (value as { difficulty?: number }).difficulty;
    if (d === 4 || d === 5 || d === 6) return d;
  }
  return 4;
}

/**
 * Difficulty picker shown inside the Pandemic multiplayer lobby. Wired
 * into the lobby route via `def.lobbyConfigComponent` — the route holds
 * the current config object and threads it into `mp.startRoom(config)`
 * when the host clicks Start. Pure presentational: the route owns the
 * state, this component just renders three chips and reports clicks.
 */
export default function PandemicLobbyConfig({ value, onChange }: LobbyConfigProps) {
  const difficulty = readDifficulty(value);

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
