import { EDITION_NAME } from "@boardgames/core/games/blood-on-the-clocktower/characters";
import {
  type BotcConfig,
  botcManifest,
} from "@boardgames/core/games/blood-on-the-clocktower/manifest";
import { MAX_PLAYERS, MIN_PLAYERS } from "@boardgames/core/games/blood-on-the-clocktower/setup";
import { configOrDefaults } from "@boardgames/core/machines/manifest";
import { useState } from "react";
import {
  SetupBriefing,
  SetupChoiceCards,
  SetupFooter,
  SetupOptions,
  SetupSection,
} from "../../../components/setup";
import { ErrorAlert, Stepper } from "../../../components/ui";
import { botcOptionFields } from "../BotcLobbyConfig";

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

  const set = (patch: Partial<BotcConfig>) =>
    setConfig(configOrDefaults(botcManifest, { ...config, ...patch }));
  const start = () =>
    onStart({
      // A random chair in the town, so you aren't always first in the circle.
      seat: role === "storyteller" ? 0 : 1 + Math.floor(Math.random() * players),
      players,
      config,
    });

  return (
    <SetupBriefing
      title="Blood on the Clocktower"
      eyebrow="Solo · every other seat a stand-in bot"
      blurb="The online game alone: run it as the Storyteller for a bot town, or play in the town under a bot Storyteller. The bots play by the rules, not to win."
      footer={
        <SetupFooter
          summary={`${role === "player" ? "A player in the town" : "The Storyteller"} · ${players} players · ${EDITION_NAME[config.edition]}`}
          onStart={start}
        />
      }
    >
      <SetupSection label="Your seat">
        <SetupChoiceCards
          label="Your seat"
          fileWord="Seat"
          choices={[
            {
              id: "player",
              label: "A player in the town",
              description: "A bot Storyteller runs the game; bots fill the other seats.",
              meta: <span className="text-amber-400">Player</span>,
            },
            {
              id: "storyteller",
              label: "The Storyteller",
              description: "You hold the Grimoire; every player is a bot.",
              meta: <span className="text-rose-400">Storyteller</span>,
            },
          ]}
          value={role}
          onChange={(id) => setRole(id === "storyteller" ? "storyteller" : "player")}
        />
      </SetupSection>
      <SetupSection label="Game">
        <SetupOptions
          options={[
            {
              id: "players",
              label: "Players in the town",
              span: "s",
              control: (
                <Stepper
                  value={players}
                  min={MIN_PLAYERS}
                  max={MAX_PLAYERS}
                  onChange={setPlayers}
                  label="Players"
                  size="sm"
                  className="flex-row gap-3"
                  caption={role === "player" ? "including you" : "plus you as the Storyteller"}
                />
              ),
            },
            ...botcOptionFields(config, set),
          ]}
        />
      </SetupSection>
      {error && <ErrorAlert message={error} />}
    </SetupBriefing>
  );
}
