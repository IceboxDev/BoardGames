import { ALL_CITY_IDS, CITY_DATA } from "./city-graph";
import type { Rng } from "./rng";
import type { CityCard, DiseaseColor, EventCard, InfectionCard, PlayerCard } from "./types";

/**
 * Fisher–Yates shuffle driven by a caller-supplied PRNG. Callers must pass
 * a deterministic Rng (see ./rng.ts) — `Math.random` is no longer accepted
 * so that every shuffle the engine performs is reproducible from the seed.
 */
export function shuffle<T>(arr: readonly T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildCityCards(): CityCard[] {
  return ALL_CITY_IDS.map((id) => {
    // biome-ignore lint/style/noNonNullAssertion: ALL_CITY_IDS is derived from CITY_DATA keys
    const city = CITY_DATA.get(id)!;
    return { kind: "city" as const, cityId: id, color: city.color };
  });
}

export function buildEventCards(): EventCard[] {
  return [
    { kind: "event", event: "airlift" },
    { kind: "event", event: "one_quiet_night" },
    { kind: "event", event: "resilient_population" },
    { kind: "event", event: "government_grant" },
    { kind: "event", event: "forecast" },
  ];
}

export function buildInfectionDeck(rng: Rng): InfectionCard[] {
  const cards: InfectionCard[] = ALL_CITY_IDS.map((id) => {
    // biome-ignore lint/style/noNonNullAssertion: ALL_CITY_IDS is derived from CITY_DATA keys
    const city = CITY_DATA.get(id)!;
    return { cityId: id, color: city.color };
  });
  return shuffle(cards, rng);
}

/**
 * Build the player deck with epidemic cards inserted per the rulebook:
 * 1. Combine 48 city + 5 event = 53 cards, shuffle
 * 2. Split into `difficulty` roughly-equal piles
 * 3. Shuffle 1 epidemic card into each pile
 * 4. Stack piles (smaller piles on bottom)
 */
export function buildPlayerDeck(
  remainingCards: PlayerCard[],
  difficulty: 4 | 5 | 6,
  rng: Rng,
): PlayerCard[] {
  const shuffled = shuffle(remainingCards, rng);

  const pileCount = difficulty;
  const piles: PlayerCard[][] = Array.from({ length: pileCount }, () => []);

  for (let i = 0; i < shuffled.length; i++) {
    piles[i % pileCount].push(shuffled[i]);
  }

  for (let p = 0; p < piles.length; p++) {
    piles[p].push({ kind: "epidemic" });
    piles[p] = shuffle(piles[p], rng);
  }

  // Stack: smaller piles on bottom (drawn last) per rulebook
  piles.sort((a, b) => a.length - b.length);

  const deck: PlayerCard[] = [];
  for (const pile of piles) {
    deck.push(...pile);
  }

  return deck;
}

/**
 * Deal initial hands from a card pool.
 * Returns [hands, remainingCards].
 */
export function dealHands(cards: PlayerCard[], numPlayers: number): [PlayerCard[][], PlayerCard[]] {
  const cardsPerPlayer = numPlayers === 2 ? 4 : numPlayers === 3 ? 3 : 2;
  const remaining = [...cards];
  const hands: PlayerCard[][] = [];

  for (let p = 0; p < numPlayers; p++) {
    hands.push(remaining.splice(0, cardsPerPlayer));
  }

  return [hands, remaining];
}

export function sortHand(hand: PlayerCard[]): PlayerCard[] {
  const colorOrder: Record<DiseaseColor, number> = {
    blue: 0,
    yellow: 1,
    black: 2,
    red: 3,
  };

  return [...hand].sort((a, b) => {
    if (a.kind === "epidemic") return 1;
    if (b.kind === "epidemic") return -1;
    if (a.kind === "event" && b.kind === "event") return a.event.localeCompare(b.event);
    if (a.kind === "event") return 1;
    if (b.kind === "event") return -1;
    const ca = a as CityCard;
    const cb = b as CityCard;
    const colorDiff = colorOrder[ca.color] - colorOrder[cb.color];
    if (colorDiff !== 0) return colorDiff;
    return ca.cityId.localeCompare(cb.cityId);
  });
}
