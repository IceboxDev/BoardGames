import { describe, expect, it } from "vitest";
import { clueProblem, clueVerdict, foldWord, guessLimit, stemOf, wordsClash } from "./clue-rules";

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

describe("clue verdicts (classic: the other spymaster may allow spelling)", () => {
  it("a form of a table word is never a clue", () => {
    expect(clueVerdict("horse", ["horse"], "en").kind).toBe("hard");
    expect(clueVerdict("horses", ["horse"], "en").kind).toBe("hard");
    expect(clueVerdict("running", ["run"], "en").kind).toBe("hard");
    expect(clueVerdict("making", ["make"], "en").kind).toBe("hard");
    expect(clueVerdict("parties", ["party"], "en").kind).toBe("hard");
    expect(clueVerdict("two words", ["horse"], "en").kind).toBe("hard");
  });

  it("spelling alone goes to the opposing spymaster — the rulebook's own examples", () => {
    expect(clueVerdict("sparrow", ["row"], "en")).toMatchObject({ kind: "soft", clash: "row" });
    expect(clueVerdict("land", ["England"], "en")).toMatchObject({
      kind: "soft",
      clash: "England",
    });
    expect(clueVerdict("horseshoe", ["horse"], "en").kind).toBe("soft");
    // Behind a derivational prefix a whole word is only spelling: RELATE holds LATE.
    expect(clueVerdict("relate", ["late"], "en").kind).toBe("soft");
  });

  // Every example on the rulebook's "Valid clues" pages (CGE, 2015, pp. 6–7),
  // as the engine rules on it. "soft" = the opposing spymaster decides.
  it.each([
    // "You can't say any form of a visible word … break, broken, breakage, or breakdown."
    ["break", "break", "hard"],
    ["broken", "break", "hard"],
    ["breakage", "break", "soft"],
    ["breakdown", "break", "soft"],
    // "You can't say part of a compound word … horse, shoe, unhorsed, or snowshoe."
    ["horse", "horseshoe", "soft"],
    ["shoe", "horseshoe", "soft"],
    // "Theatre and theater are different forms of the same word."
    ["theatre", "theater", "hard"],
    // "Gland is not a valid clue for ENGLAND" (letters, not meaning).
    ["gland", "England", "soft"],
    // "Don't be too strict … island is a valid clue for ENGLAND. Even land … sparrow … ROW."
    ["island", "England", "ok"],
    ["land", "England", "soft"],
    ["sparrow", "row", "soft"],
    // "You can give the clue k-n-i-g-h-t even when NIGHT is one of the codenames."
    ["knight", "night", "soft"],
    // Letters and numbers are fine when they mean something: X for RAY, eight for OCTOPUS.
    ["x", "ray", "ok"],
    ["eight", "octopus", "ok"],
    ["strudel", "Berlin", "ok"],
  ] as const)("rulebook: %s with %s on the table is %s", (clue, table, kind) => {
    expect(clueVerdict(clue, [table], "en").kind).toBe(kind);
  });

  it("an irregular form that is a word of its own goes to the opposing spymaster", () => {
    expect(clueVerdict("mice", ["mouse"], "en").kind).toBe("hard");
    expect(clueVerdict("went", ["go"], "en").kind).toBe("hard");
    expect(clueVerdict("better", ["good"], "en").kind).toBe("hard");
    expect(clueVerdict("knives", ["knife"], "en").kind).toBe("hard");
    expect(clueVerdict("left", ["leave"], "en").kind).toBe("soft");
    // FOUND a city, a carpenter's SAW, a ROSE: only spelling ties them to FIND, SEE, RISE.
    expect(clueVerdict("found", ["find"], "en").kind).toBe("soft");
    expect(clueVerdict("saw", ["see"], "en").kind).toBe("soft");
    expect(clueVerdict("rise", ["rose"], "en").kind).toBe("soft");
  });

  it("the other spelling of a word is the same word: COLOUR, ORGANISE, ANALYSE", () => {
    expect(clueVerdict("colour", ["color"], "en").kind).toBe("hard");
    expect(clueVerdict("organised", ["organize"], "en").kind).toBe("hard");
    expect(clueVerdict("analyse", ["analyze"], "en").kind).toBe("hard");
    expect(clueVerdict("centres", ["center"], "en").kind).toBe("hard");
    expect(clueVerdict("catalogue", ["catalog"], "en").kind).toBe("hard");
    expect(clueVerdict("travelled", ["travel"], "en").kind).toBe("hard");
    // …but TIMBRE (a sound) is not TIMBER (wood).
    expect(clueVerdict("timbre", ["timber"], "en").kind).toBe("ok");
  });

  it("a hard clash anywhere on the table wins over a soft one", () => {
    expect(clueVerdict("rows", ["sparrow", "row"], "en").kind).toBe("hard");
  });

  it("clean words are fine, and the strict check still refuses spelling", () => {
    expect(clueVerdict("saddle", ["horse"], "en")).toEqual({ kind: "ok" });
    expect(clueProblem("sparrow", ["row"], "en")).toMatch(/ROW/);
  });
});
