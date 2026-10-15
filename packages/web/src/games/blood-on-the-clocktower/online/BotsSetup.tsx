import {
  type BotcConfig,
  botcManifest,
} from "@boardgames/core/games/blood-on-the-clocktower/manifest";
import { MAX_PLAYERS, MIN_PLAYERS } from "@boardgames/core/games/blood-on-the-clocktower/setup";
import { configOrDefaults } from "@boardgames/core/machines/manifest";
import { useState } from "react";
import { SetupHeader, SetupLayout } from "../../../components/setup";
import { Button, ErrorAlert, FieldGroup, SelectableCard, Stepper } from "../../../components/ui";
import BotcLobbyConfig from "../BotcLobbyConfig";

/** What the Singleplayer screen starts: your seat, the town's size, the options. */
export interface BotsSetupChoice {
  /** Your room seat: 0 runs the game as the Storyteller, any other plays in the town. */
  readonly seat: number;
  /** Residents in the town (the Storyteller not counted). */
  readonly players: number;
  readonly config: BotcConfig;
}

/**
 * Singleplayer: the online game with every other seat a stand-in bot. Run it
 * as the Storyteller for a bot town, or play in the town under a bot
 * Storyteller. The bots are placeholders — they play by the rules, not to win.
 */
export function BotsSetup({
  onStart,
  error,
}: {
  onStart: (choice: BotsSetupChoice) => void;
  /** Why the server refused the last start. */
  error: string | null;
}) {
  const [role, setRole] = useState<"storyteller" | "player">("player");
  const [players, setPlayers] = useState(8);
  const [config, setConfig] = useState<BotcConfig>(() => configOrDefaults(botcManifest, {}));

  return (
    <SetupLayout>
      <SetupHeader title="Blood on the Clocktower" />
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <FieldGroup label="Your seat">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SelectableCard
              variant="row"
              tone="amber"
              title="A player in the town"
              description="A bot Storyteller runs the game; bots fill the other seats."
              selected={role === "player"}
              onClick={() => setRole("player")}
            />
            <SelectableCard
              variant="row"
              tone="rose"
              title="The Storyteller"
              description="You hold the Grimoire; every player is a bot."
              selected={role === "storyteller"}
              onClick={() => setRole("storyteller")}
            />
          </div>
        </FieldGroup>
        <FieldGroup label="Players in the town">
          <Stepper
            value={players}
            min={MIN_PLAYERS}
            max={MAX_PLAYERS}
            onChange={setPlayers}
            label="Players"
            caption={role === "player" ? "including you" : "plus you as the Storyteller"}
          />
        </FieldGroup>
        <BotcLobbyConfig
          value={config}
          onChange={(next) => setConfig(configOrDefaults(botcManifest, next))}
        />
        {error && <ErrorAlert message={error} />}
        <Button
          size="lg"
          variant="solid"
          tone="amber"
          onClick={() =>
            onStart({
              // A random chair in the town, so you aren't always first in the circle.
              seat: role === "storyteller" ? 0 : 1 + Math.floor(Math.random() * players),
              players,
              config,
            })
          }
        >
          Start
        </Button>
      </div>
    </SetupLayout>
  );
}
