/**
 * The one way a game starts, for solo sessions and rooms alike: check the
 * seating against the manifest, parse the client's options with the game's own
 * schema, pick the seed, and let the game build its START event. Nothing the
 * client sent reaches the machine except through these steps.
 */

import { randomSeed } from "@boardgames/core/lib/rng";
import { seatingProblem } from "@boardgames/core/machines/manifest";
import type { StartSeat } from "@boardgames/core/machines/seats";
import type { AnyGameMachineSpec } from "@boardgames/core/machines/types";
import type { EventObject } from "xstate";

export type PreparedStart =
  | {
      readonly ok: true;
      readonly event: EventObject;
      readonly seats: readonly StartSeat[];
      readonly seed: number;
    }
  | { readonly ok: false; readonly reason: string };

export function prepareStart(
  spec: AnyGameMachineSpec,
  seats: readonly StartSeat[],
  rawConfig: unknown,
  seed: number = randomSeed(),
): PreparedStart {
  const { manifest } = spec;
  const problem = seatingProblem(manifest, seats);
  if (problem) return { ok: false, reason: problem };

  const config = manifest.config.safeParse(rawConfig ?? {});
  if (!config.success) {
    const issue = config.error.issues[0];
    const where = issue?.path.length ? ` (${issue.path.join(".")})` : "";
    return { ok: false, reason: `Invalid game options${where}: ${issue?.message ?? "unknown"}` };
  }

  try {
    const event = spec.buildStart({ seats, config: config.data, seed });
    return { ok: true, event, seats, seed };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "Could not start the game" };
  }
}
