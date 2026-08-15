import { describe, expect, it } from "vitest";
import { collectionToCsv } from "./collection-csv.ts";
import type { CollectionRow } from "./collection-rows.ts";

const vocab = {
  boxes: [{ id: "b1", name: "Kallax, top shelf", note: null }],
  sleeveTypes: [{ id: "st1", name: "Standard Euro", widthMm: 59, heightMm: 92, brand: null }],
  statuses: [{ id: "cs1", label: "In rotation", sortOrder: 1 }],
};

function row(overrides: Partial<CollectionRow>): CollectionRow {
  return {
    key: "lost-cities",
    slug: "lost-cities",
    item: null,
    title: "Lost Cities",
    thumbnail: null,
    bggId: 50,
    kind: "catalog",
    legacy: false,
    playCount: 12,
    lastPlayedAt: null,
    playedThrough: false,
    ...overrides,
  };
}

describe("collectionToCsv", () => {
  it("serializes metadata through the vocab name maps", () => {
    const csv = collectionToCsv(
      [
        row({
          item: {
            id: "i1",
            slug: "lost-cities",
            customTitle: null,
            boxId: "b1",
            sleeveStatus: "sleeved",
            sleeveTypeId: "st1",
            statusId: "cs1",
            widthMm: 200,
            depthMm: 50,
            heightMm: 280,
            weightG: 600,
            language: "EN",
            acquiredOn: "2025-12-24",
            pricePaidCents: 2499,
            note: null,
            playedThroughAt: null,
            updatedAt: "2026-08-15 10:00:00",
          },
        }),
      ],
      vocab,
    );
    const [header, line] = csv.split("\n");
    expect(header.startsWith("Title,Status,Box,Sleeves")).toBe(true);
    expect(line).toContain("Lost Cities,In rotation");
    // Comma inside the box name forces quoting.
    expect(line).toContain('"Kallax, top shelf"');
    expect(line).toContain("24.99");
  });

  it("escapes quotes and marks played-through rows", () => {
    const csv = collectionToCsv(
      [
        row({
          title: 'EXIT: The "Cabin"',
          playedThrough: true,
        }),
      ],
      vocab,
    );
    const line = csv.split("\n")[1];
    expect(line).toContain('"EXIT: The ""Cabin"""');
    expect(line).toContain("yes");
  });
});
