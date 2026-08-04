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
  /** Traveller seats only: the Storyteller-assigned alignment. */
  alignment?: "good" | "evil";
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

/** Weighted sample without replacement. Zero-weight items are never picked. */
function weightedDraw<T>(
  pool: readonly T[],
  weightOf: (item: T) => number,
  count: number,
  rng: () => number,
): T[] {
  const items = pool.filter((t) => weightOf(t) > 0);
  const picked: T[] = [];
  while (picked.length < count && items.length > 0) {
    const total = items.reduce((sum, t) => sum + weightOf(t), 0);
    let roll = rng() * total;
    let idx = 0;
    for (; idx < items.length - 1; idx++) {
      roll -= weightOf(items[idx]);
      if (roll <= 0) break;
    }
    picked.push(items.splice(idx, 1)[0]);
  }
  return picked;
}

// ── Demon bluffs ──────────────────────────────────────────────────────

/** How practised the demon player is at sustaining a bluff. */
export type DemonSkill = "new" | "experienced";

/**
 * How playable each character is AS A DEMON BLUFF, per skill level.
 * Unlisted characters weigh 1.
 *
 * - Ongoing-info claims (Empath, Fortune Teller, Undertaker) are the
 *   strongest bluffs — fresh fabricated "info" every day, never pinnable —
 *   but demand confident daily lying, so they're down-weighted for new
 *   demon players.
 * - Passive/low-proof claims (Soldier, Monk, Ravenkeeper, Mayor, Saint,
 *   Butler) have nothing to invent — ideal for a first-time demon.
 * - The Slayer is a famously good bluff either way: publicly fake-shoot a
 *   good player and "nothing happens" looks perfectly normal.
 * - First-night-info claims (Chef, Washerwoman, Librarian, Investigator)
 *   force the demon to invent concrete day-1 info and defend it all game.
 * - The Virgin is NEVER offered: the claim is publicly testable on demand
 *   (nominate them, nothing happens, bluff dead).
 */
const BLUFF_WEIGHTS: Record<DemonSkill, Partial<Record<CharacterId, number>>> = {
  new: {
    soldier: 4,
    monk: 4,
    ravenkeeper: 3,
    mayor: 3,
    slayer: 3,
    butler: 3,
    saint: 3,
    recluse: 2,
    empath: 1,
    "fortune-teller": 1,
    undertaker: 1,
    chef: 1,
    washerwoman: 1,
    librarian: 1,
    investigator: 1,
    virgin: 0,
  },
  experienced: {
    empath: 4,
    "fortune-teller": 4,
    undertaker: 4,
    slayer: 4,
    soldier: 2,
    monk: 2,
    ravenkeeper: 2,
    mayor: 2,
    butler: 2,
    saint: 2,
    recluse: 2,
    chef: 1,
    washerwoman: 1,
    librarian: 1,
    investigator: 1,
    virgin: 0,
  },
};

/**
 * Pick the three not-in-play good characters shown to the Demon as safe
 * bluffs. Aims for the rulebook's two-Townsfolk-plus-one-Outsider mix, then
 * layers Storyteller wisdom on top:
 *
 * - weighted by bluff quality for the demon's skill level (BLUFF_WEIGHTS);
 * - the Drunk's believed token is excluded (someone visibly holds it) and
 *   the Drunk itself is unclaimable;
 * - coherence with the actual game: in a zero-Outsider game an Outsider
 *   claim implies a Baron and invites scrutiny (down-weighted ×0.3) — and if
 *   the Librarian is also in play she will truthfully learn "zero", so
 *   Outsider bluffs are a trap and are skipped entirely.
 */
export function chooseDemonBluffs(
  opts: {
    charactersInPlay: CharacterId[];
    believedCharacter?: CharacterId;
    skill?: DemonSkill;
  },
  rng: () => number = Math.random,
): CharacterId[] {
  const { charactersInPlay, believedCharacter, skill = "new" } = opts;
  const inPlay = new Set(charactersInPlay);
  const weights = BLUFF_WEIGHTS[skill];
  const weightOf = (id: CharacterId, factor = 1) => (weights[id] ?? 1) * factor;

  const townsfolkPool = charactersOfType("townsfolk")
    .map((c) => c.id)
    .filter((id) => !inPlay.has(id) && id !== believedCharacter);
  const outsiderPool = charactersOfType("outsider")
    .map((c) => c.id)
    .filter((id) => !inPlay.has(id) && id !== "drunk");

  const outsidersInPlay = charactersInPlay.filter(
    (id) => CHARACTERS[id].type === "outsider",
  ).length;
  const outsiderFactor = outsidersInPlay > 0 ? 1 : inPlay.has("librarian") ? 0 : 0.3;

  const bluffs = [
    ...weightedDraw(townsfolkPool, (id) => weightOf(id), 2, rng),
    ...weightedDraw(outsiderPool, (id) => weightOf(id, outsiderFactor), 1, rng),
  ];
  // Backfill from the remaining Townsfolk (weighted; zero-weight only as the
  // absolute last resort so we always return three).
  while (bluffs.length < 3) {
    const rest = townsfolkPool.filter((id) => !bluffs.includes(id));
    const pick = weightedDraw(rest, (id) => weightOf(id), 1, rng)[0] ?? rest[0];
    if (!pick) break;
    bluffs.push(pick);
  }
  return bluffs.slice(0, 3);
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
export function dealBag(
  playerCount: number,
  rng: () => number = Math.random,
  demonSkill: DemonSkill = "new",
): BagSetup {
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

  return {
    charactersInPlay,
    bagTokens,
    ...(believed !== undefined ? { believedCharacter: believed } : {}),
    distribution: finalDist,
    demonBluffs: chooseDemonBluffs(
      { charactersInPlay, believedCharacter: believed, skill: demonSkill },
      rng,
    ),
  };
}

/**
 * Build the seated setup from a recorded physical draw: `drawnTokens[i]` is
 * the token the player in seat `i` pulled from the bag. Whoever drew the
 * believed-Townsfolk token becomes the Drunk. The Fortune Teller's red
 * herring is rolled here, once the seats are known.
 */
/**
 * One recorded seat, in circle order: either a resident with the bag token
 * they drew, or a traveller seat (no draw — travellers never touch the bag;
 * their public character and secret alignment are the Storyteller's records).
 */
export type RecordedSeat =
  | { name: string; token: CharacterId; traveller?: undefined }
  | {
      name: string;
      token?: undefined;
      traveller: { character: CharacterId; alignment: "good" | "evil" };
    };

export function setupFromDraws(
  recorded: RecordedSeat[],
  bag: BagSetup,
  rng: () => number = Math.random,
): GameSetup {
  const residentCount = recorded.filter((r) => !r.traveller).length;
  if (residentCount !== bag.bagTokens.length) {
    throw new Error("every resident seat needs exactly one drawn token");
  }
  const travellerChars = recorded
    .filter((r) => r.traveller)
    .map((r) => r.traveller?.character as CharacterId);
  if (travellerChars.some((c) => CHARACTERS[c].type !== "traveller")) {
    throw new Error("traveller seats must hold traveller characters");
  }
  if (new Set(travellerChars).size !== travellerChars.length) {
    throw new Error("each traveller character can be in play only once");
  }

  const seats: SeatSetup[] = recorded.map((r, seat) => {
    if (r.traveller) {
      return {
        seat,
        name: r.name,
        character: r.traveller.character,
        alignment: r.traveller.alignment,
      };
    }
    const token = r.token;
    const isDrunk = bag.believedCharacter !== undefined && token === bag.believedCharacter;
    return {
      seat,
      name: r.name,
      character: isDrunk ? ("drunk" as CharacterId) : token,
      ...(isDrunk ? { believedCharacter: bag.believedCharacter } : {}),
    };
  });

  const fortuneTellerInPlay = seats.some((s) => s.character === "fortune-teller");
  // The red herring is a good RESIDENT — travellers never carry it.
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
  const tokens = shuffled(bag.bagTokens, rng);
  return setupFromDraws(
    names.map((name, i) => ({ name, token: tokens[i] })),
    bag,
    rng,
  );
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
