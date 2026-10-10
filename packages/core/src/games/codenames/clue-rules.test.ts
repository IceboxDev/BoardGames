import { describe, expect, it } from "vitest";
import { clueProblem, foldWord, guessLimit, stemOf, wordsClash } from "./clue-rules";

describe("foldWord", () => {
  it("folds case, umlauts, ß and accents", () => {
    expect(foldWord("Bär")).toBe("baer");
    expect(foldWord("Straße")).toBe("strasse");
    expect(foldWord("Café")).toBe("cafe");
    expect(foldWord("  U-Boot ")).toBe("uboot");
  });
});

describe("clue legality", () => {
  const table = ["horse", "ear", "pie", "Schlüssel"];

  it("accepts an unrelated single word", () => {
    expect(clueProblem("saddle", table, "en")).toBeNull();
    expect(clueProblem("heart", table, "en")).toBeNull(); // EAR inside, not a compound end
  });

  it("rejects empty, multi-word and digit clues", () => {
    expect(clueProblem("  ", table, "en")).toMatch(/Type a clue/);
    expect(clueProblem("ice cream", table, "en")).toMatch(/one word/);
    expect(clueProblem("r2d2", table, "en")).toMatch(/one word/);
  });

  it("rejects a word on the table, in any case", () => {
    expect(clueProblem("HORSE", table, "en")).toMatch(/HORSE/);
  });

  it("rejects compounds built on a table word", () => {
    expect(clueProblem("horseshoe", table, "en")).toMatch(/HORSE/);
    expect(clueProblem("earring", table, "en")).toMatch(/EAR/);
    expect(clueProblem("Hausschlüssel", table, "de")).toMatch(/SCHLÜSSEL/);
  });

  it("rejects a table word behind a prefix", () => {
    expect(clueProblem("subatomic", ["atom"], "en")).toMatch(/ATOM/);
    expect(clueProblem("unhorsed", table, "en")).toMatch(/HORSE/);
    expect(clueProblem("Vorschlüssel", table, "de")).toMatch(/SCHLÜSSEL/);
    expect(clueProblem("atomic", ["subatom"], "en")).not.toBeNull();
    expect(clueProblem("transverse", ["atom"], "en")).toBeNull();
  });

  it("rejects simple inflections", () => {
    expect(clueProblem("horses", table, "en")).not.toBeNull();
    expect(clueProblem("pies", table, "en")).not.toBeNull();
    expect(wordsClash("Schlüsseln", "Schlüssel", "de")).toBe(true);
  });

  it("folds umlauts when comparing German", () => {
    expect(clueProblem("Schluessel", table, "de")).not.toBeNull();
  });

  it("ignores face-down restriction once a word is covered (caller passes face-up only)", () => {
    expect(clueProblem("horse", ["ear"], "en")).toBeNull();
  });
});

describe("stems and guess limits", () => {
  it("strips one suffix but keeps three letters", () => {
    expect(stemOf("dancing", "en")).toBe("danc");
    expect(stemOf("bus", "en")).toBe("bus");
  });

  it("allows n+1, unlimited for 0 and ∞", () => {
    expect(guessLimit(2)).toBe(3);
    expect(guessLimit(0)).toBeNull();
    expect(guessLimit("unlimited")).toBeNull();
  });
});
