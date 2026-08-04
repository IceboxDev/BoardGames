// Trouble Brewing setup: character-count distribution and the secret bag draw.
//
// Mirrors the rulebook's SETUP steps 6–9: choose the right number of each
// character type for the player count, apply orange-flower adjustments (the
// Baron's [+2 Outsiders]; the Drunk's believed-Townsfolk token), then deal one
// character per seat. All randomness goes through an injected `rng` so tests
// are deterministic.

import type { CharacterId } from "./characters.ts";
import { CHARACTERS, charactersOfType } from "./characters.ts";

export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 15;

export type Distribution = {
  townsfolk: number;
  outsiders: number;
  minions: number;
  demons: number;
};

/** The setup-sheet table for 5–15 players. */
const DISTRIBUTIONS: Record<number, Distribution> = {
  5: { townsfolk: 3, outsiders: 0, minions: 1, demons: 1 },
  6: { townsfolk: 3, outsiders: 1, minions: 1, demons: 1 },
  7: { townsfolk: 5, outsiders: 0, minions: 1, demons: 1 },
  8: { townsfolk: 5, outsiders: 1, minions: 1, demons: 1 },
  9: { townsfolk: 5, outsiders: 2, minions: 1, demons: 1 },
  10: { townsfolk: 7, outsiders: 0, minions: 2, demons: 1 },
  11: { townsfolk: 7, outsiders: 1, minions: 2, demons: 1 },
  12: { townsfolk: 7, outsiders: 2, minions: 2, demons: 1 },
  13: { townsfolk: 9, outsiders: 0, minions: 3, demons: 1 },
  14: { townsfolk: 9, outsiders: 1, minions: 3, demons: 1 },
  15: { townsfolk: 9, outsiders: 2, minions: 3, demons: 1 },
};

export function baseDistribution(playerCount: number): Distribution {
  const d = DISTRIBUTIONS[playerCount];
  if (!d) throw new Error(`Trouble Brewing needs ${MIN_PLAYERS}–${MAX_PLAYERS} players`);
  return d;
}

/** The distribution after the Baron's [+2 Outsiders] swap. */
export function baronAdjusted(d: Distribution): Distribution {
  return { ...d, townsfolk: d.townsfolk - 2, outsiders: d.outsiders + 2 };
}

export type SeatSetup = {
  seat: number;
  name: string;
  character: CharacterId;
  /** Drunk only: the not-in-play Townsfolk this player believes they are. */
  believedCharacter?: CharacterId;
};

export type GameSetup = {
  seats: SeatSetup[];
  distribution: Distribution;
  /** Three not-in-play good characters to show the Demon as safe bluffs. */
  demonBluffs: CharacterId[];
  /** Seat of the good player who registers as a Demon to the Fortune Teller. */
  redHerringSeat?: number;
};

function shuffled<T>(items: readonly T[], rng: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function draw<T>(pool: T[], count: number, rng: () => number): T[] {
  return shuffled(pool, rng).slice(0, count);
}

/**
 * The bag the Storyteller physically prepares. The phone never leaves the
 * ST's hands: the app names the tokens to drop in the bag, players draw them
 * at the table, and the draw is recorded afterwards via `setupFromDraws`.
 */
export type BagSetup = {
  /** The actual characters in play — includes "drunk" when dealt. */
  charactersInPlay: CharacterId[];
  /**
   * The physical tokens for the bag: identical to `charactersInPlay` except
   * the Drunk is replaced by their believed Townsfolk token. Whoever draws
   * that token IS the Drunk — they never learn it.
   */
  bagTokens: CharacterId[];
  /** Set when the Drunk is in play: the not-in-play Townsfolk token they drew. */
  believedCharacter?: CharacterId;
  distribution: Distribution;
  /** Three not-in-play good characters to show the Demon as safe bluffs. */
  demonBluffs: CharacterId[];
};

/**
 * Roll the bag composition for a player count (rulebook SETUP steps 6–8):
 * the right number of each type, the Baron's [+2 Outsiders] swap, the Drunk's
 * believed-Townsfolk stand-in token, and the Demon's three bluffs.
 */
export function dealBag(playerCount: number, rng: () => number = Math.random): BagSetup {
  const dist = baseDistribution(playerCount);
  const townsfolkPool = charactersOfType("townsfolk").map((c) => c.id);
  const outsiderPool = charactersOfType("outsider").map((c) => c.id);
  const minionPool = charactersOfType("minion").map((c) => c.id);

  const minions = draw(minionPool, dist.minions, rng);
  const finalDist = minions.includes("baron") ? baronAdjusted(dist) : dist;

  const outsiders = draw(outsiderPool, finalDist.outsiders, rng);
  const townsfolk = draw(townsfolkPool, finalDist.townsfolk, rng);
  const charactersInPlay = [...townsfolk, ...outsiders, ...minions, "imp" as CharacterId];

  const notInPlayTownsfolk = townsfolkPool.filter((id) => !townsfolk.includes(id));
  const believed = outsiders.includes("drunk") ? draw(notInPlayTownsfolk, 1, rng)[0] : undefined;
  const bagTokens = charactersInPlay.map((id) => (id === "drunk" && believed ? believed : id));

  // Demon bluffs: three good characters neither in play nor claimed by the
  // Drunk's believed token. Prefer two Townsfolk + one Outsider (the
  // rulebook's recommendation) and fall back to any good characters when the
  // Outsider pool is exhausted (e.g. Baron games can use all four Outsiders).
  const bluffTownsfolk = notInPlayTownsfolk.filter((id) => id !== believed);
  const bluffOutsiders = outsiderPool.filter((id) => !outsiders.includes(id) && id !== "drunk");
  const bluffs = [...draw(bluffTownsfolk, 2, rng), ...draw(bluffOutsiders, 1, rng)];
  while (bluffs.length < 3) {
    const extra = bluffTownsfolk.find((id) => !bluffs.includes(id));
    if (!extra) break;
    bluffs.push(extra);
  }

  return {
    charactersInPlay,
    bagTokens,
    ...(believed !== undefined ? { believedCharacter: believed } : {}),
    distribution: finalDist,
    demonBluffs: bluffs.slice(0, 3),
  };
}

/**
 * Build the seated setup from a recorded physical draw: `drawnTokens[i]` is
 * the token the player in seat `i` pulled from the bag. Whoever drew the
 * believed-Townsfolk token becomes the Drunk. The Fortune Teller's red
 * herring is rolled here, once the seats are known.
 */
export function setupFromDraws(
  names: string[],
  bag: BagSetup,
  drawnTokens: CharacterId[],
  rng: () => number = Math.random,
): GameSetup {
  if (drawnTokens.length !== names.length) {
    throw new Error("every seat needs exactly one drawn token");
  }
  const seats: SeatSetup[] = names.map((name, seat) => {
    const token = drawnTokens[seat];
    const isDrunk = bag.believedCharacter !== undefined && token === bag.believedCharacter;
    return {
      seat,
      name,
      character: isDrunk ? ("drunk" as CharacterId) : token,
      ...(isDrunk ? { believedCharacter: bag.believedCharacter } : {}),
    };
  });

  const fortuneTellerInPlay = seats.some((s) => s.character === "fortune-teller");
  const goodSeats = seats.filter((s) =>
    ["townsfolk", "outsider"].includes(CHARACTERS[s.character].type),
  );
  const redHerringSeat = fortuneTellerInPlay ? draw(goodSeats, 1, rng)[0]?.seat : undefined;

  return {
    seats,
    distribution: bag.distribution,
    demonBluffs: bag.demonBluffs,
    ...(redHerringSeat !== undefined ? { redHerringSeat } : {}),
  };
}

/**
 * Deal a full Trouble Brewing setup in one step (bag + simulated draw).
 * The companion's physical flow uses `dealBag` + `setupFromDraws` instead;
 * this remains for tests and any future fully-digital mode.
 */
export function dealSetup(names: string[], rng: () => number = Math.random): GameSetup {
  const bag = dealBag(names.length, rng);
  return setupFromDraws(names, bag, shuffled(bag.bagTokens, rng), rng);
}

/** Human-readable "3 Townsfolk · 1 Outsider · 1 Minion · 1 Demon". */
export function describeDistribution(d: Distribution): string {
  const part = (n: number, singular: string, plural: string) =>
    `${n} ${n === 1 ? singular : plural}`;
  return [
    part(d.townsfolk, "Townsfolk", "Townsfolk"),
    part(d.outsiders, "Outsider", "Outsiders"),
    part(d.minions, "Minion", "Minions"),
    part(d.demons, "Demon", "Demons"),
  ].join(" · ");
}

export function characterName(id: CharacterId): string {
  return CHARACTERS[id].name;
}
