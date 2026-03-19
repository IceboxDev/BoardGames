import { explodingKittensSpec } from "@boardgames/core/games/exploding-kittens/machine";
import { lostCitiesSpec } from "@boardgames/core/games/lost-cities/machine";
import { pandemicSpec } from "@boardgames/core/games/pandemic/machine";
import type { GameMachineSpec } from "@boardgames/core/machines/types";

const registry = new Map<string, GameMachineSpec<any, any, any, any>>();
registry.set("lost-cities", lostCitiesSpec);
registry.set("exploding-kittens", explodingKittensSpec);
registry.set("pandemic", pandemicSpec);

export function getMachineSpec(slug: string): GameMachineSpec<any, any, any, any> | undefined {
  return registry.get(slug);
}

export function getRegisteredSlugs(): string[] {
  return [...registry.keys()];
}
