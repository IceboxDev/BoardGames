/**
 * Dealing: the 25 words and the key card. Shared by Codenames and Duet. All
 * randomness comes from the game's seeded `Rng`.
 */

import { type Rng, shuffle } from "../../lib/rng";
import { wordsClash } from "./clue-rules";
import { type Language, WORD_SETS } from "./words";

export const BOARD_SIZE = 25;
export const GRID_COLUMNS = 5;

/**
 * 25 words for one board. A word that clashes with one already dealt (one
 * contains the other, or they share a stem) is skipped, so every board leaves
 * clues for every card.
 */
export function dealWords(rng: Rng, language: Language): string[] {
  const words: string[] = [];
  for (const word of shuffle(WORD_SETS[language], rng)) {
    if (words.some((w) => wordsClash(w, word, language))) continue;
    words.push(word);
    if (words.length === BOARD_SIZE) return words;
  }
  throw new Error(`The ${language} word set can't fill a board`);
}

/** What a classic key card says about a card. */
export type KeyEntry = 0 | 1 | "bystander" | "assassin";

/** The classic key: the starting team's 9 agents, the other's 8, 7 bystanders, 1 assassin. */
export function dealKey(rng: Rng, startingTeam: 0 | 1): KeyEntry[] {
  const other = (1 - startingTeam) as 0 | 1;
  const key: KeyEntry[] = [
    ...Array<KeyEntry>(9).fill(startingTeam),
    ...Array<KeyEntry>(8).fill(other),
    ...Array<KeyEntry>(7).fill("bystander"),
    "assassin",
  ];
  return shuffle(key, rng);
}

/** What one side of a Duet key says about a card. */
export type DuetKeyEntry = "agent" | "bystander" | "assassin";

/** Both sides of a Duet key for one card: `[side A, side B]`. */
export type DuetKeyPair = readonly [DuetKeyEntry, DuetKeyEntry];

/**
 * The Duet key's printed distribution (RULES.md): each side has 9 agents, 3
 * assassins and 13 bystanders; 3 agents are shared, every assassin is an
 * assassin, an agent or a bystander on the other side exactly once.
 */
const DUET_DISTRIBUTION: readonly (readonly [DuetKeyPair, number])[] = [
  [["agent", "agent"], 3],
  [["agent", "bystander"], 5],
  [["bystander", "agent"], 5],
  [["agent", "assassin"], 1],
  [["assassin", "agent"], 1],
  [["assassin", "assassin"], 1],
  [["assassin", "bystander"], 1],
  [["bystander", "assassin"], 1],
  [["bystander", "bystander"], 7],
];

export function dealDuetKey(rng: Rng): DuetKeyPair[] {
  const cells: DuetKeyPair[] = DUET_DISTRIBUTION.flatMap(([pair, n]) =>
    Array.from({ length: n }, () => pair),
  );
  return shuffle(cells, rng);
}
