/**
 * Dealing: the 25 words and the key card. Shared by Codenames and Duet. All
 * randomness comes from the game's seeded `Rng`.
 */

import { type Rng, shuffle } from "../../lib/rng";
import { foldWord, wordsClash } from "./clue-rules";
import { SECOND_TEAM_AGENTS, STARTING_TEAM_AGENTS } from "./seating";
import { type Language, WORD_SETS } from "./words";

export const BOARD_SIZE = 25;
export const GRID_COLUMNS = 5;

/**
 * The fewest words a deal draws from. Avoiding recent boards never shrinks the
 * pool below this, so a deal always has room to skip clashing pairs.
 */
export const MIN_FRESH_POOL = 150;

/**
 * The words a deal may use: the whole set minus the words of `recentBoards`
 * (newest first). At a table you flip the cards or deal fresh ones, so the
 * next game never shows last game's words: the newest board is always left
 * out, then older ones while at least `MIN_FRESH_POOL` words remain.
 */
export function freshWordPool(
  language: Language,
  recentBoards: readonly (readonly string[])[] = [],
): readonly string[] {
  const all = WORD_SETS[language];
  if (recentBoards.length === 0) return all;
  const folded = all.map(foldWord);
  let avoid = new Set<string>();
  for (const [i, board] of recentBoards.entries()) {
    const next = new Set(avoid);
    for (const word of board) next.add(foldWord(word));
    const left = folded.filter((w) => !next.has(w)).length;
    if (i > 0 && left < MIN_FRESH_POOL) break;
    avoid = next;
  }
  return all.filter((_, i) => !avoid.has(folded[i] as string));
}

/**
 * 25 words for one board, none from the newest of `recentBoards` and as few
 * as possible from older ones (`freshWordPool`). A word that clashes with one
 * already dealt (one contains the other, or they share a stem) is skipped, so
 * every board leaves clues for every card.
 */
export function dealWords(
  rng: Rng,
  language: Language,
  recentBoards: readonly (readonly string[])[] = [],
): string[] {
  const words: string[] = [];
  for (const word of shuffle(freshWordPool(language, recentBoards), rng)) {
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
    ...Array<KeyEntry>(STARTING_TEAM_AGENTS).fill(startingTeam),
    ...Array<KeyEntry>(SECOND_TEAM_AGENTS).fill(other),
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

/**
 * The boards of earlier games in this session, newest first, read from their
 * replay logs (`StartInput.recentLogs`). Anything that isn't a log with 25
 * words is ignored: the logs come from another game or an older format.
 */
export function recentBoardsOf(logs: readonly unknown[] | undefined): string[][] {
  const boards: string[][] = [];
  for (const log of logs ?? []) {
    if (typeof log !== "object" || log === null || !("words" in log)) continue;
    const { words } = log;
    if (
      Array.isArray(words) &&
      words.length === BOARD_SIZE &&
      words.every((w) => typeof w === "string")
    ) {
      boards.push(words as string[]);
    }
  }
  return boards;
}
