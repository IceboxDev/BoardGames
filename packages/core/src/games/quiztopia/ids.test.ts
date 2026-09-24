import { describe, expect, it } from "vitest";
import {
  cardId,
  cardRef,
  deckCardRefs,
  hashSeed,
  newIntroductionOrder,
  parseCardRef,
  parseQuestionId,
  parseSetId,
  questionId,
  questionIdForRef,
  setId,
  shuffledIntroductionOrder,
  shuffledSetOrder,
  virtualCardRefs,
} from "./ids.ts";

const CARDS = ["c001", "c002", "c003"];

describe("id round trips", () => {
  it("builds and parses card, set and question ids", () => {
    expect(cardId(42)).toBe("c042");
    expect(setId("c042", 7)).toBe("c042-s07");
    expect(questionId("c042-s07", 3)).toBe("c042-s07-q3");
    expect(parseSetId("c042-s07")).toEqual({ cardId: "c042", n: 7 });
    expect(parseQuestionId("c042-s12-q4")).toEqual({
      cardId: "c042",
      setId: "c042-s12",
      n: 12,
      q: 4,
    });
    for (const id of ["c001-s01-q0", "c177-s12-q4", "c099-s10-q2"]) {
      const p = parseQuestionId(id);
      expect(p).not.toBeNull();
      if (p) expect(questionId(setId(p.cardId, p.n), p.q)).toBe(id);
    }
  });

  it("builds and parses card refs, original and virtual", () => {
    expect(cardRef("c042", 0)).toBe("c042");
    expect(cardRef("c042", 3)).toBe("c042-v3");
    expect(parseCardRef("c042")).toEqual({ cardId: "c042", q: 0 });
    expect(parseCardRef("c042-v3")).toEqual({ cardId: "c042", q: 3 });
    expect(questionIdForRef("c042-v3", 7)).toBe("c042-s07-q3");
    expect(questionIdForRef("c042", 1)).toBe("c042-s01-q0");
    expect(questionIdForRef("bogus", 1)).toBeNull();
  });

  it("rejects malformed ids and out-of-range ordinals", () => {
    for (const bad of ["c1", "c0421", "C042", "c042-s13", "c042-s00", "c042-s07-q5", "c042-v5"]) {
      expect(parseQuestionId(bad)).toBeNull();
      expect(parseSetId(bad)).toBeNull();
      expect(parseCardRef(bad)).toBeNull();
    }
    expect(parseCardRef("c042-v0")).toBeNull();
    expect(parseQuestionId("c042-s07")).toBeNull();
    expect(parseSetId("c042-s07-q0")).toBeNull();
    expect(() => cardId(0)).toThrow(/out of range/);
    expect(() => cardId(1000)).toThrow(/out of range/);
    expect(() => cardId(1.5)).toThrow();
    expect(() => setId("c42", 1)).toThrow(/bad card id/);
    expect(() => setId("c042", 13)).toThrow(/bad set n/);
    expect(() => questionId("c042-s07", 5)).toThrow(/bad q/);
    expect(() => questionId("c042", 0)).toThrow(/bad set id/);
    expect(() => cardRef("c042", 5)).toThrow(/bad sibling/);
  });
});

describe("decks", () => {
  it("derives four virtual cards per card, grouped by sibling", () => {
    const virtual = virtualCardRefs(CARDS);
    expect(virtual).toHaveLength(CARDS.length * 4);
    expect(virtual.slice(0, 3)).toEqual(["c001-v1", "c002-v1", "c003-v1"]);
    expect(virtual.at(-1)).toBe("c003-v4");
    expect(new Set(virtual).size).toBe(virtual.length);
  });

  it("lists the original deck as a copy and the extended deck as five times the cards", () => {
    const original = deckCardRefs(CARDS, "original");
    expect(original).toEqual(CARDS);
    expect(original).not.toBe(CARDS);
    const extended = deckCardRefs(CARDS, "extended");
    expect(extended).toHaveLength(CARDS.length * 5);
    expect(extended.slice(0, 3)).toEqual(CARDS);
    expect(new Set(extended).size).toBe(extended.length);
    expect(extended.every((ref) => parseCardRef(ref) !== null)).toBe(true);
  });
});

describe("newIntroductionOrder", () => {
  it("introduces every card's original question before any sibling", () => {
    const order = newIntroductionOrder(CARDS, 7);
    expect(order).toHaveLength(CARDS.length * 5);
    expect(order.slice(0, CARDS.length)).toEqual(["c001-s07-q0", "c002-s07-q0", "c003-s07-q0"]);
    const firstSibling = order.findIndex((id) => !id.endsWith("-q0"));
    expect(firstSibling).toBe(CARDS.length);
    expect(order.slice(0, firstSibling).every((id) => id.endsWith("-q0"))).toBe(true);
    expect(order.every((id) => parseQuestionId(id)?.n === 7)).toBe(true);
    expect(new Set(order).size).toBe(order.length);
  });
});

describe("shuffledIntroductionOrder", () => {
  const cards = Array.from({ length: 20 }, (_, i) => cardId(i + 1));

  it("keeps every original before any sibling and is a permutation of the plain order", () => {
    const out = shuffledIntroductionOrder(cards, 7, hashSeed("user-a:7"));
    expect([...out].sort()).toEqual([...newIntroductionOrder(cards, 7)].sort());
    const firstSibling = out.findIndex((id) => !id.endsWith("-q0"));
    expect(out.slice(0, firstSibling).every((id) => id.endsWith("-q0"))).toBe(true);
    expect(firstSibling).toBe(cards.length);
  });

  it("is stable for one seed and differs across seeds", () => {
    const a = shuffledIntroductionOrder(cards, 1, hashSeed("user-a:1"));
    expect(shuffledIntroductionOrder(cards, 1, hashSeed("user-a:1"))).toEqual(a);
    expect(shuffledIntroductionOrder(cards, 1, hashSeed("user-b:1"))).not.toEqual(a);
    expect(a).not.toEqual(newIntroductionOrder(cards, 1));
  });

  it("hashes text to a 32-bit seed deterministically", () => {
    expect(hashSeed("x")).toBe(hashSeed("x"));
    expect(hashSeed("x")).not.toBe(hashSeed("y"));
    expect(Number.isInteger(hashSeed("anything"))).toBe(true);
  });
});

describe("shuffledSetOrder", () => {
  const cards = Array.from({ length: 20 }, (_, i) => cardId(i + 1));

  it("keeps each set's five questions together, original first", () => {
    const out = shuffledSetOrder(cards, 4, hashSeed("user-a:4"));
    expect([...out].sort()).toEqual([...newIntroductionOrder(cards, 4)].sort());
    for (let i = 0; i < out.length; i += 5) {
      const set = out.slice(i, i + 5);
      expect(new Set(set.map((id) => id.slice(0, -3))).size).toBe(1);
      expect(set.map((id) => id.slice(-2))).toEqual(["q0", "q1", "q2", "q3", "q4"]);
    }
    expect(out).not.toEqual(shuffledSetOrder(cards, 4, hashSeed("user-b:4")));
  });
});
