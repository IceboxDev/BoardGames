// The online game before the deal: the Storyteller shapes the circle, picks
// the Travellers and edits the bag, then deals it digitally — the shuffled
// bag tokens land on the resident chairs exactly as a physical draw would, and
// `setupFromDraws` turns the draws into the Grimoire (Drunk / Lunatic swaps,
// the Fortune Teller's red herring). Every roll comes from the game's seeded
// generator, so a replay deals the same town.

import { shuffle } from "../../../lib/rng.ts";
import type { Edition } from "../characters.ts";
import { CHARACTERS, type CharacterId, travellersOf } from "../characters.ts";
import { createGame } from "../companion.ts";
import { MAX_TRAVELLERS } from "../manifest.ts";
import type { BagSetup, CompanionState, DemonSkill } from "../schema.ts";
import {
  chooseDemonBluffs,
  dealBag,
  MAX_PLAYERS,
  MIN_PLAYERS,
  type RecordedSeat,
  replaceCharacterInBag,
  replaceDrunkStandIn,
  setupFromDraws,
} from "../setup.ts";
import type { RoomSeat, SetupStage } from "./state.ts";

export type Rng = () => number;

/** Residents (everyone in the circle who isn't a Traveller). */
export function residentCount(setup: SetupStage): number {
  return setup.order.length - setup.travellers.length;
}

/** Why the bag can't be dealt yet, or `null`. */
export function residentProblem(setup: SetupStage): string | null {
  const n = residentCount(setup);
  if (n < MIN_PLAYERS) return `The bag needs at least ${MIN_PLAYERS} residents (there are ${n})`;
  if (n > MAX_PLAYERS) return `The bag holds at most ${MAX_PLAYERS} residents (there are ${n})`;
  return null;
}

/** A fresh bag for the current residents, or `null` when there are too few or too many. */
export function freshBag(setup: SetupStage, edition: Edition, rng: Rng): BagSetup | null {
  if (residentProblem(setup)) return null;
  return dealBag(residentCount(setup), rng, setup.demonSkill, edition);
}

export function initialSetup(
  playerSeats: readonly RoomSeat[],
  edition: Edition,
  demonSkill: DemonSkill,
  rng: Rng,
): SetupStage {
  const base: SetupStage = { order: [...playerSeats], travellers: [], bag: null, demonSkill };
  return { ...base, bag: freshBag(base, edition, rng) };
}

/** A new circle order: must be a permutation of the seated players. */
export function reorder(setup: SetupStage, order: readonly RoomSeat[]): SetupStage | string {
  const want = [...setup.order].sort((a, b) => a - b).join(",");
  if ([...order].sort((a, b) => a - b).join(",") !== want) {
    return "The new order must list every player exactly once";
  }
  return { ...setup, order: [...order] };
}

/** Mark (or unmark) a player as a Traveller; the bag is redealt for the new resident count. */
export function setTraveller(
  setup: SetupStage,
  roomSeat: RoomSeat,
  traveller: { character: CharacterId | null; alignment: "good" | "evil" } | null,
  edition: Edition,
  rng: Rng,
): SetupStage | string {
  if (!setup.order.includes(roomSeat)) return "That player isn't in the circle";
  if (traveller?.character && CHARACTERS[traveller.character].type !== "traveller") {
    return `The ${CHARACTERS[traveller.character].name} isn't a Traveller`;
  }
  if (traveller?.character && !travellersOf(edition).includes(traveller.character)) {
    return `The ${CHARACTERS[traveller.character].name} isn't on this script`;
  }
  if (
    traveller?.character &&
    setup.travellers.some((t) => t.roomSeat !== roomSeat && t.character === traveller.character)
  ) {
    return `The ${CHARACTERS[traveller.character].name} is already in play`;
  }
  const others = setup.travellers.filter((t) => t.roomSeat !== roomSeat);
  if (traveller && others.length >= MAX_TRAVELLERS) return `At most ${MAX_TRAVELLERS} Travellers`;
  const travellers = traveller ? [...others, { roomSeat, ...traveller }] : others;
  const next = { ...setup, travellers };
  const residentsChanged = residentCount(next) !== residentCount(setup);
  return residentsChanged ? { ...next, bag: freshBag(next, edition, rng) } : next;
}

export function reroll(setup: SetupStage, edition: Edition, rng: Rng): SetupStage {
  return { ...setup, bag: freshBag(setup, edition, rng) };
}

export function swapToken(
  setup: SetupStage,
  from: CharacterId,
  to: CharacterId,
  rng: Rng,
): SetupStage | string {
  if (!setup.bag) return residentProblem(setup) ?? "There's no bag yet";
  try {
    return {
      ...setup,
      bag: replaceCharacterInBag(setup.bag, from, to, { rng, demonSkill: setup.demonSkill }),
    };
  } catch (err) {
    return err instanceof Error ? err.message : "That swap isn't possible";
  }
}

export function swapStandIn(
  setup: SetupStage,
  character: CharacterId,
  rng: Rng,
): SetupStage | string {
  if (!setup.bag) return residentProblem(setup) ?? "There's no bag yet";
  try {
    return {
      ...setup,
      bag: replaceDrunkStandIn(setup.bag, character, { rng, demonSkill: setup.demonSkill }),
    };
  } catch (err) {
    return err instanceof Error ? err.message : "That stand-in isn't possible";
  }
}

export function setDemonSkill(setup: SetupStage, skill: DemonSkill, rng: Rng): SetupStage {
  if (!setup.bag) return { ...setup, demonSkill: skill };
  const demonBluffs = chooseDemonBluffs(
    {
      charactersInPlay: setup.bag.charactersInPlay,
      ...(setup.bag.believedCharacter ? { believedCharacter: setup.bag.believedCharacter } : {}),
      skill,
      edition: setup.bag.edition,
    },
    rng,
  );
  return { ...setup, demonSkill: skill, bag: { ...setup.bag, demonBluffs } };
}

/**
 * Deal: roll any Traveller left unpicked, shuffle the bag onto the resident
 * chairs, and build the Grimoire. Chair `i` is `order[i]`, recorded on the
 * player as `roomSeat`.
 */
export function deal(
  setup: SetupStage,
  names: readonly string[],
  opts: { storyteller: string; gameId: string; startedAt: string; edition: Edition },
  rng: Rng,
): CompanionState | string {
  const problem = residentProblem(setup);
  if (problem) return problem;
  if (!setup.bag) return "There's no bag yet";

  const taken = new Set(setup.travellers.flatMap((t) => (t.character ? [t.character] : [])));
  const pool = travellersOf(opts.edition).filter((c) => !taken.has(c));
  const travellerOf = new Map<RoomSeat, { character: CharacterId; alignment: "good" | "evil" }>();
  for (const t of setup.travellers) {
    let character = t.character;
    if (!character) {
      const i = Math.floor(rng() * pool.length);
      character = pool.splice(i, 1)[0] ?? null;
    }
    if (!character) return "There aren't enough Travellers on this script";
    travellerOf.set(t.roomSeat, { character, alignment: t.alignment });
  }

  const tokens = shuffle(setup.bag.bagTokens, rng);
  const recorded: RecordedSeat[] = setup.order.map((roomSeat) => {
    const name = names[roomSeat] ?? `Player ${roomSeat}`;
    const traveller = travellerOf.get(roomSeat);
    if (traveller) return { name, traveller };
    const token = tokens.shift();
    if (!token) throw new Error("bag ran out of tokens");
    return { name, token };
  });

  let game: CompanionState;
  try {
    game = createGame(setupFromDraws(recorded, setup.bag, rng), {
      storyteller: opts.storyteller,
      gameId: opts.gameId,
      startedAt: opts.startedAt,
    });
  } catch (err) {
    return err instanceof Error ? err.message : "The deal failed";
  }
  return {
    ...game,
    players: game.players.map((p, chair) => ({ ...p, roomSeat: setup.order[chair] })),
  };
}
