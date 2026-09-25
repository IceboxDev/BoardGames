import { describe, expect, it } from "vitest";
import { insertFollowUp, type SessionCard } from "./useGeoSession";

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
