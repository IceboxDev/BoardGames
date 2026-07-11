import { createRng } from "../../lib/rng";
import { getCardDef } from "./cards";
import { buildAgeDeck } from "./deck";
import type { CardId, GameState, PlayerState, WonderId } from "./types";
import { emptyEdificeFields, makeCardId } from "./types";

/** Hand-built states for engine tests. Not part of the shipped game surface. */

export interface PlayerSetup {
  wonder: WonderId;
  side?: "A" | "B";
  coins?: number;
  tableau?: string[];
  stagesBuilt?: number;
  militaryTokens?: number[];
  hand?: string[];
}

/** Turn card names into unique instance ids (duplicates get distinct copy indices). */
export function idsFor(names: string[]): CardId[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const copy = seen.get(name) ?? 0;
    seen.set(name, copy + 1);
    return makeCardId(name, getCardDef(name).age, copy);
  });
}

export function makeTestState(
  setups: PlayerSetup[],
  overrides: Partial<GameState> = {},
): GameState {
  const playerCount = setups.length;
  const players: PlayerState[] = setups.map((s) => ({
    wonderId: s.wonder,
    side: s.side ?? "A",
    stagesBuilt: s.stagesBuilt ?? 0,
    coins: s.coins ?? 3,
    tableau: idsFor(s.tableau ?? []),
    militaryTokens: s.militaryTokens ?? [],
    freeBuildUsedThisAge: false,
    ...emptyEdificeFields(),
  }));
  const rng = createRng(1234);
  return {
    seed: 1234,
    playerCount,
    age: 1,
    turn: 1,
    phase: "selecting",
    players,
    hands: setups.map((s) => idsFor(s.hand ?? [])),
    selections: setups.map(() => null),
    discard: [],
    pendingQueue: [],
    ageDecks: {
      2: buildAgeDeck(2, playerCount, rng),
      3: buildAgeDeck(3, playerCount, rng),
    },
    lastRevealed: [],
    actionLog: [],
    ...overrides,
  };
}
