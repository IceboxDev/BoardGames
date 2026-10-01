/**
 * Every server-run game: its machine spec, and the machine a new session runs.
 *
 * Adding a game means adding one entry here (and its manifest to
 * `@boardgames/core/games/manifests`); `registry.test.ts` keeps the two lists
 * identical. Games whose AI needs something only the server has — a native
 * binary, a model gateway, a worker pool — bind it into the machine per session through
 * XState's `provide`, so there is no module-global AI state anywhere.
 */

import { sevenWondersSpec, withSevenWondersAgent } from "@boardgames/core/games/7-wonders/machine";
import { decryptoSpec, withDecryptoAgent } from "@boardgames/core/games/decrypto/machine";
import { durakSpec } from "@boardgames/core/games/durak/machine";
import { explodingKittensSpec } from "@boardgames/core/games/exploding-kittens/machine";
import { lostCitiesSpec } from "@boardgames/core/games/lost-cities/machine";
import { pandemicSpec } from "@boardgames/core/games/pandemic/machine";
import { parksSpec } from "@boardgames/core/games/parks/machine";
import { quiztopiaSpec } from "@boardgames/core/games/quiztopia/machine";
import { sensoSpec } from "@boardgames/core/games/senso-battle-for-japan/machine";
import { setPvpSpec } from "@boardgames/core/games/set/pvp-machine";
import { skyTeamSpec } from "@boardgames/core/games/sky-team/machine";
import { sushiGoSpec } from "@boardgames/core/games/sushi-go/machine";
import { theHungerSpec, withHungerAiOffload } from "@boardgames/core/games/the-hunger/machine";
import { resistanceSpec } from "@boardgames/core/games/the-resistance/machine";
import type { AnyGameMachineSpec } from "@boardgames/core/machines/types";
import type { AnyActorLogic } from "xstate";
import { aiAvailable } from "../lib/ai";
import { openAiDecryptoAgent } from "./decrypto-agent.ts";
import { hungerAiOffload } from "./hunger-ai-pool.ts";
import { sevenWondersSearchAgent } from "./seven-wonders-agent.ts";

export interface ServerGame {
  readonly spec: AnyGameMachineSpec;
  /** The machine for a new session — the spec's own, or one with server-only AI bound in. */
  readonly createMachine: () => AnyActorLogic;
}

/** A game whose machine runs exactly as the spec defines it. */
function plain(spec: AnyGameMachineSpec): ServerGame {
  return { spec, createMachine: () => spec.machine };
}

const SERVER_GAMES: readonly ServerGame[] = [
  {
    spec: sevenWondersSpec,
    createMachine: () => {
      const agent = sevenWondersSearchAgent();
      return agent ? withSevenWondersAgent(agent) : sevenWondersSpec.machine;
    },
  },
  {
    spec: decryptoSpec,
    // Checked per session: AI can be suspended and resumed at runtime.
    createMachine: () =>
      aiAvailable() ? withDecryptoAgent(openAiDecryptoAgent) : decryptoSpec.machine,
  },
  plain(durakSpec),
  plain(explodingKittensSpec),
  plain(lostCitiesSpec),
  plain(pandemicSpec),
  plain(parksSpec),
  plain(quiztopiaSpec),
  plain(sensoSpec),
  plain(setPvpSpec),
  plain(skyTeamSpec),
  plain(sushiGoSpec),
  {
    spec: theHungerSpec,
    // Search seats (Strigoi, Dracula) think on the shared worker pool.
    createMachine: () => {
      const offload = hungerAiOffload();
      return offload ? withHungerAiOffload(offload) : theHungerSpec.machine;
    },
  },
  plain(resistanceSpec),
];

const bySlug = new Map(SERVER_GAMES.map((game) => [game.spec.manifest.slug, game]));

export function getServerGame(slug: string): ServerGame | undefined {
  return bySlug.get(slug);
}

export function getRegisteredSlugs(): string[] {
  return [...bySlug.keys()];
}
