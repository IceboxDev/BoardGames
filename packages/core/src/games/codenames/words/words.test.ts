import { describe, expect, it } from "vitest";
import { createRng } from "../../../lib/rng";
import { BOARD_SIZE, dealWords } from "../board";
import { foldWord } from "../clue-rules";
import { LANGUAGES, WORD_SETS } from ".";

describe.each(LANGUAGES)("%s word set", (language) => {
  const words = WORD_SETS[language];

  it("has enough words for varied boards", () => {
    expect(words.length).toBeGreaterThanOrEqual(400);
  });

  it("has no duplicates once folded", () => {
    const folded = words.map(foldWord);
    const dupes = folded.filter((w, i) => folded.indexOf(w) !== i);
    expect(dupes).toEqual([]);
  });

  it("is single tokens only", () => {
    for (const word of words) expect(word, word).toMatch(/^\p{L}[\p{L}-]*$/u);
  });

  it("always fills a board", () => {
    for (let seed = 0; seed < 200; seed++) {
      expect(dealWords(createRng(seed), language)).toHaveLength(BOARD_SIZE);
    }
  });
});
