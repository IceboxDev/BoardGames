import { durakSpec } from "@boardgames/core/games/durak/machine";
import { explodingKittensSpec } from "@boardgames/core/games/exploding-kittens/machine";
import { lostCitiesSpec } from "@boardgames/core/games/lost-cities/machine";
import { pandemicSpec } from "@boardgames/core/games/pandemic/machine";
import { setPvpSpec } from "@boardgames/core/games/set/pvp-machine";
import { sushiGoSpec } from "@boardgames/core/games/sushi-go/machine";
import type { GameMachineSpec } from "@boardgames/core/machines/types";
import type { AnyActorLogic } from "xstate";

const registry = new Map<string, GameMachineSpec<AnyActorLogic, unknown, unknown, unknown>>();
registry.set("durak", durakSpec);
registry.set("lost-cities", lostCitiesSpec);
registry.set("exploding-kittens", explodingKittensSpec);
registry.set("pandemic", pandemicSpec);
registry.set("set", setPvpSpec);
registry.set("sushi-go", sushiGoSpec);

export function getMachineSpec(
  slug: string,
): GameMachineSpec<AnyActorLogic, unknown, unknown, unknown> | undefined {
  return registry.get(slug);
}

export function getRegisteredSlugs(): string[] {
  return [...registry.keys()];
}
