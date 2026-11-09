import { describe, expect, it } from "vitest";
import { createRng } from "../../lib/rng";
import { BOARD_SIZE, dealWords, freshWordPool, MIN_FRESH_POOL, recentBoardsOf } from "./board";
import { foldWord } from "./clue-rules";
import { WORD_SETS } from "./words";

describe("dealing fresh words", () => {
  it("never repeats the previous board's words", () => {
    for (let seed = 0; seed < 50; seed++) {
      const last = dealWords(createRng(seed), "en");
      const next = dealWords(createRng(seed + 1000), "en", [last]);
      expect(next.filter((w) => last.includes(w))).toEqual([]);
      expect(next).toHaveLength(BOARD_SIZE);
    }
  });

  it("avoids older boards too while the pool stays large enough", () => {
    const boards: string[][] = [];
    for (let game = 0; game < 4; game++) {
      const board = dealWords(createRng(77 + game), "en", boards);
      for (const earlier of boards) expect(board.filter((w) => earlier.includes(w))).toEqual([]);
      boards.unshift(board);
    }
  });

  it("drops the oldest boards first once the pool would get too small", () => {
    const all = WORD_SETS.en;
    // Boards that together use every word: only the newest can be avoided.
    const boards: string[][] = [];
    for (let i = 0; i < all.length; i += BOARD_SIZE) boards.push(all.slice(i, i + BOARD_SIZE));
    const pool = freshWordPool("en", boards);
    expect(pool.length).toBeGreaterThanOrEqual(MIN_FRESH_POOL);
    const newest = new Set(boards[0]?.map(foldWord));
    expect(pool.some((w) => newest.has(foldWord(w)))).toBe(false);
  });

  it("reads boards from replay logs and ignores anything else", () => {
    const words = dealWords(createRng(5), "en");
    expect(recentBoardsOf([{ words }, { words: ["x"] }, null, "log", { nope: 1 }])).toEqual([
      words,
    ]);
    expect(recentBoardsOf(undefined)).toEqual([]);
  });

  it("deals exactly as before when there are no recent boards", () => {
    expect(dealWords(createRng(9), "de", [])).toEqual(dealWords(createRng(9), "de"));
  });
});
