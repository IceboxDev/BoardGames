import { describe, expect, it } from "vitest";
import {
  ARTICLE_ID_RE,
  articleId,
  articleIdFromLegacy,
  FACT_ID_RE,
  factId,
  factIdFromLegacy,
  idNumber,
  wordingId,
} from "./ids.ts";

describe("quiz ids", () => {
  it("formats and parses counters", () => {
    expect(articleId(7)).toBe("a0007");
    expect(factId(123)).toBe("f00123");
    expect(wordingId(123)).toBe("w00123");
    expect(idNumber("f00123")).toBe(123);
    expect(idNumber("a12345")).toBe(12345);
    expect(idNumber("c042")).toBeNull();
    expect(ARTICLE_ID_RE.test(articleId(10_000))).toBe(true);
    expect(FACT_ID_RE.test("f0001")).toBe(false);
  });

  // Pinned: migration 0061 computes the same numbers in SQL from the legacy
  // ids, so this formula can never change.
  it("maps the first import's legacy ids by formula", () => {
    expect(factIdFromLegacy("c001-s01-q0")).toBe("f00001");
    expect(factIdFromLegacy("c001-s01-q4")).toBe("f00005");
    expect(factIdFromLegacy("c001-s02-q0")).toBe("f00006");
    expect(factIdFromLegacy("c002-s01-q0")).toBe("f00061");
    expect(factIdFromLegacy("c177-s12-q4")).toBe("f10620");
    expect(articleIdFromLegacy("c001-s01")).toBe("a0001");
    expect(articleIdFromLegacy("c002-s01")).toBe("a0013");
    expect(articleIdFromLegacy("c177-s12")).toBe("a2124");
    expect(factIdFromLegacy("c001-s13-q0")).toBeNull();
    expect(articleIdFromLegacy("nope")).toBeNull();
  });
});
