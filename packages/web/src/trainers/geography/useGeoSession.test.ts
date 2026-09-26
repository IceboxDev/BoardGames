import { describe, expect, it } from "vitest";
import { type Answered, insertFollowUp, type SessionCard, sessionProgress } from "./useGeoSession";

const card = (placeId: string, stage: 1 | 2 | 3 | 4): SessionCard => ({
  cardId: `${placeId}:s${stage}`,
  placeId,
  stage,
  tier: stage === 1 ? "new" : "stage",
  state: null,
});

describe("insertFollowUp", () => {
  it("shuffles each stage round instead of repeating the first round's order", () => {
    const orders = new Set<string>();
    for (let trial = 0; trial < 40; trial++) {
      const places = ["a", "b", "c", "d", "e", "f", "g"];
      const items = places.map((p) => card(p, 1));
      for (let cursor = 0; cursor < places.length; cursor++) {
        insertFollowUp(items, cursor, card(items[cursor].placeId, 2), Math.random());
      }
      const round2 = items.slice(7).map((i) => i.placeId);
      expect(round2.sort()).toEqual(places); // every place once
      orders.add(
        items
          .slice(7)
          .map((i) => i.placeId)
          .join(""),
      );
    }
    expect(orders.size).toBeGreaterThan(20);
  });

  it("never puts a place's next stage straight after it", () => {
    for (let trial = 0; trial < 200; trial++) {
      const items = ["a", "b", "c"].map((p) => card(p, 1));
      for (let cursor = 0; cursor < 3; cursor++) {
        insertFollowUp(items, cursor, card(items[cursor].placeId, 2), Math.random());
      }
      for (let i = 1; i < items.length; i++) {
        expect(items[i].placeId === items[i - 1].placeId).toBe(false);
      }
    }
  });
});

describe("sessionProgress", () => {
  const answered = (item: SessionCard, grade: Answered["grade"]) => ({ item, grade }) as Answered;

  it("keeps its total while misses and next stages join the queue", () => {
    const a1 = card("co:AAA", 1);
    const b3 = card("co:BBB", 3);
    const plan = new Map([
      ["co:AAA", 4],
      ["co:BBB", 2],
    ]);
    // A cleared stage 1 queued its stage 2; B missed and comes back.
    const items = [a1, b3, card("co:AAA", 2), { ...b3, retry: true }];
    const p = sessionProgress(plan, items, [answered(a1, "good"), answered(b3, "again")]);
    expect(p).toEqual({ placesDone: 0, places: 2, fraction: 1 / 6 });
  });

  it("counts a place finished once nothing but a decoy is left for it", () => {
    const a4 = card("co:AAA", 4);
    const plan = new Map([["co:AAA", 1]]);
    const items = [a4, { ...a4, decoy: true }];
    const p = sessionProgress(plan, items, [answered(a4, "good")]);
    expect(p).toEqual({ placesDone: 1, places: 1, fraction: 1 });
  });

  it("counts a place given up for today as finished", () => {
    const a2 = card("co:AAA", 2);
    const plan = new Map([["co:AAA", 3]]);
    const p = sessionProgress(plan, [a2], [answered(a2, "again")]);
    expect(p.placesDone).toBe(1);
    expect(p.fraction).toBe(1);
  });
});
