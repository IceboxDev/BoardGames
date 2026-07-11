import type { Rng } from "../../lib/rng";
import { shuffle } from "../../lib/rng";
import type { Age, CardColor, ResourceType } from "./types";

/**
 * 7 Wonders: Edifice expansion — communal projects players may co-fund while
 * building a Wonder stage. Card data and effect semantics are transcribed from
 * the rulebook + "Description of New Effects" sheet and cross-checked against a
 * real BGA game's `edifice_meta` (see bga/fixtures/real-capture.json).
 */

export type EdificeReward =
  | { kind: "coins"; amount: number }
  | { kind: "shield"; amount: number }
  | { kind: "victory-token"; value: number }
  | { kind: "remove-defeat-tokens" }
  | { kind: "production"; resources: readonly ResourceType[] }
  | { kind: "points-per-wonder-stage" } // 1 VP / built stage (self)
  | { kind: "points-per-blue" } // 1 VP / civilian card (self)
  | { kind: "points-per-color" } // 1 VP / distinct Age-card color (self)
  | { kind: "points-per-brown-grey-set"; amount: number } // amount VP / min(brown, grey)
  | { kind: "duplicate-guild" }; // re-apply one own purple card at scoring

export type EdificePenalty =
  | { kind: "discard-color"; color: CardColor }
  | { kind: "coins"; amount: number }
  | { kind: "lose-victory-tokens"; amount: number };

export interface EdificeCardDef {
  name: string;
  age: Age;
  /** Participation cost in coins, paid alongside the Wonder-stage cost. */
  cost: number;
  reward: readonly EdificeReward[];
  penalty: EdificePenalty;
}

const brown = "brown";
const grey = "grey";
const blue = "blue";
const yellow = "yellow";
const red = "red";
const green = "green";

// ── The 15 Edifice cards (5 per Age) ─────────────────────────────────────────

export const EDIFICES: readonly EdificeCardDef[] = [
  // Age I
  {
    name: "Artisan District",
    age: 1,
    cost: 2,
    reward: [{ kind: "points-per-brown-grey-set", amount: 2 }],
    penalty: { kind: "discard-color", color: yellow },
  },
  {
    name: "Belvedere",
    age: 1,
    cost: 1,
    reward: [{ kind: "points-per-wonder-stage" }],
    penalty: { kind: "discard-color", color: brown },
  },
  {
    name: "Curtain Wall",
    age: 1,
    cost: 2,
    reward: [{ kind: "shield", amount: 1 }],
    penalty: { kind: "discard-color", color: grey },
  },
  {
    name: "Money Changer",
    age: 1,
    cost: 1,
    reward: [{ kind: "coins", amount: 4 }],
    penalty: { kind: "coins", amount: 2 },
  },
  {
    name: "Outpost",
    age: 1,
    cost: 1,
    reward: [{ kind: "victory-token", value: 3 }],
    penalty: { kind: "discard-color", color: red },
  },
  // Age II
  {
    name: "Factory",
    age: 2,
    cost: 3,
    reward: [{ kind: "production", resources: ["glass", "loom", "papyrus"] }],
    penalty: { kind: "discard-color", color: brown },
  },
  {
    name: "Amphitheater",
    age: 2,
    cost: 3,
    reward: [{ kind: "points-per-blue" }],
    penalty: { kind: "discard-color", color: grey },
  },
  {
    name: "Auction House",
    age: 2,
    cost: 2,
    reward: [{ kind: "coins", amount: 7 }],
    penalty: { kind: "coins", amount: 5 },
  },
  {
    name: "Staging Camp",
    age: 2,
    cost: 3,
    reward: [{ kind: "victory-token", value: 5 }],
    penalty: { kind: "discard-color", color: red },
  },
  {
    name: "River Port",
    age: 2,
    cost: 3,
    reward: [{ kind: "production", resources: ["wood", "stone", "ore", "clay"] }],
    penalty: { kind: "discard-color", color: blue },
  },
  // Age III
  {
    name: "Gold Reserves",
    age: 3,
    cost: 3,
    reward: [{ kind: "coins", amount: 15 }],
    penalty: { kind: "coins", amount: 9 },
  },
  {
    name: "Archives",
    age: 3,
    cost: 5,
    reward: [{ kind: "points-per-color" }],
    penalty: { kind: "discard-color", color: blue },
  },
  {
    name: "Concentric Castle",
    age: 3,
    cost: 5,
    reward: [{ kind: "shield", amount: 2 }],
    penalty: { kind: "lose-victory-tokens", amount: 2 },
  },
  {
    name: "Agora",
    age: 3,
    cost: 6,
    reward: [{ kind: "duplicate-guild" }],
    penalty: { kind: "discard-color", color: green },
  },
  {
    name: "Military School",
    age: 3,
    cost: 5,
    reward: [{ kind: "victory-token", value: 5 }, { kind: "remove-defeat-tokens" }],
    penalty: { kind: "discard-color", color: red },
  },
];

export const EDIFICE_BY_NAME: ReadonlyMap<string, EdificeCardDef> = new Map(
  EDIFICES.map((e) => [e.name, e]),
);

export function getEdificeDef(name: string): EdificeCardDef {
  const def = EDIFICE_BY_NAME.get(name);
  if (!def) throw new Error(`Unknown edifice: ${name}`);
  return def;
}

/** Debt-token value (negative VP) suffered when a penalty can't be paid, by Age. */
export const DEBT_TOKEN_VALUE: Record<Age, number> = { 1: -2, 2: -3, 3: -5 };

/**
 * Participation pawns placed on each Age's Edifice, by player count. Confirmed
 * at 5 players = 3 from a real BGA game; the others follow the same round(n/2)
 * shape. Adjust here if the official table differs for another count.
 */
export const PARTICIPATION_PAWNS: Record<number, number> = { 3: 2, 4: 2, 5: 3, 6: 3, 7: 4 };

export function participationPawnCount(playerCount: number): number {
  return PARTICIPATION_PAWNS[playerCount] ?? Math.round(playerCount / 2);
}

/** Choose one Edifice per Age (I/II/III), shuffled by the seeded rng. */
export function chooseEdifices(rng: Rng): [string, string, string] {
  const pick = (age: Age) =>
    shuffle(
      EDIFICES.filter((e) => e.age === age),
      rng,
    )[0].name;
  return [pick(1), pick(2), pick(3)];
}
