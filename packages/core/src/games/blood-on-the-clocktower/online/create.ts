import { rngFrom, rngStateFromSeed } from "../../../lib/rng.ts";
import type { BotcConfig } from "../manifest.ts";
import { initialSetup } from "./setup-stage.ts";
import { type BotcOnline, EMPTY_DAY, ONLINE_STATE_VERSION } from "./state.ts";

/**
 * A new online game: room seat 0 is the Storyteller, the rest sit in room
 * order until the Storyteller re-seats them, and the first bag is already
 * rolled from the seed.
 */
export function createOnlineGame(input: {
  names: readonly string[];
  config: BotcConfig;
  seed: number;
}): BotcOnline {
  const carrier = { rngState: rngStateFromSeed(input.seed) };
  const players = input.names.map((_, i) => i).filter((i) => i !== 0);
  const setup = initialSetup(
    players,
    input.config.edition,
    input.config.demonSkill,
    rngFrom(carrier),
  );
  const seats = input.names.length;
  return {
    version: ONLINE_STATE_VERSION,
    rev: 0,
    seed: input.seed,
    config: input.config,
    rngState: carrier.rngState,
    names: input.names.map((n, i) => n.slice(0, 60) || (i === 0 ? "Storyteller" : `Player ${i}`)),
    connected: Array.from({ length: seats }, () => true),
    stage: "setup",
    setup,
    companion: null,
    publicLife: Array.from({ length: seats }, (_, i) => i !== 0),
    shown: Array.from({ length: seats }, () => null),
    inbox: Array.from({ length: seats }, () => []),
    wake: null,
    requests: [],
    day: EMPTY_DAY,
    timeline: [],
    chat: [],
    whispers: [],
    chatSettings: { publicOpen: true, whispersOpen: true },
    past: [],
    future: [],
    nextId: 1,
    log: [],
  };
}
