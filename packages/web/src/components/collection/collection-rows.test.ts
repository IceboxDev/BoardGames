import type { CollectionItem, CollectionResponse } from "@boardgames/core/protocol";
import { describe, expect, it } from "vitest";
import { buildCollectionRows } from "./collection-rows.ts";

// The New badge is decided here, once, so the table, the filters and the CSV
// agree: a copy the owner hasn't played since acquiring it is new — unless it
// has been played through, which is the end of its story, not the start.

function item(overrides: Partial<CollectionItem>): CollectionItem {
  return {
    id: "ci-1",
    slug: "lost-cities",
    customTitle: null,
    containerKey: null,
    sleeveStatus: "none",
    sleeveTypeId: null,
    statusId: null,
    widthMm: null,
    depthMm: null,
    heightMm: null,
    extraBoxes: [],
    weightG: null,
    language: null,
    acquiredOn: null,
    pricePaidCents: null,
    note: null,
    playedThroughAt: null,
    isNew: false,
    updatedAt: "2026-09-10 10:00:00",
    ...overrides,
  };
}

function response(items: CollectionItem[], slugs: string[] = ["lost-cities"]): CollectionResponse {
  return {
    ownerId: "u1",
    editable: false,
    slugs,
    items,
    sleeveTypes: [],
    statuses: [],
    playStats: [],
    announcements: [],
  };
}

describe("buildCollectionRows — new acquisitions", () => {
  it("carries the server's new flag onto the row", () => {
    const rows = buildCollectionRows(response([item({ isNew: true })]));
    expect(rows.map((r) => [r.key, r.isNew])).toEqual([["lost-cities", true]]);
  });

  it("is never new without a metadata row", () => {
    expect(buildCollectionRows(response([]))[0]?.isNew).toBe(false);
  });

  it("is never new once played through", () => {
    const rows = buildCollectionRows(
      response([item({ isNew: true, playedThroughAt: "2026-09-01 10:00:00" })]),
    );
    expect(rows[0]?.playedThrough).toBe(true);
    expect(rows[0]?.isNew).toBe(false);
  });

  it("flags a new custom box too", () => {
    const rows = buildCollectionRows(
      response([item({ id: "ci-9", slug: null, customTitle: "Homebrew", isNew: true })], []),
    );
    expect(rows.map((r) => [r.key, r.isNew])).toEqual([["ci-9", true]]);
  });
});
