import { describe, expect, it } from "vitest";
import { z } from "zod";
import { isCatalogSlug } from "../games/catalog.ts";
import { PURCHASES, PurchaseRecordSchema, purchasesForUser } from "./data.ts";

// The coherence gate for code-side data edits: a Claude session folding a
// campaign post into `data.ts` must leave this suite green. Every check here
// guards an invariant the display layer assumes.

describe("PURCHASES coherence", () => {
  it("parses whole against the record schema", () => {
    expect(() => z.array(PurchaseRecordSchema).parse(PURCHASES)).not.toThrow();
  });

  it("has unique purchase ids and globally unique event ids", () => {
    const purchaseIds = PURCHASES.map((p) => p.id);
    expect(new Set(purchaseIds).size).toBe(purchaseIds.length);
    const eventIds = PURCHASES.flatMap((p) => p.events.map((e) => e.id));
    expect(new Set(eventIds).size).toBe(eventIds.length);
  });

  it("links only catalog slugs", () => {
    for (const p of PURCHASES) {
      if (p.slug !== null) expect(isCatalogSlug(p.slug), `${p.id}: ${p.slug}`).toBe(true);
    }
  });

  it("carries only real calendar dates", () => {
    // The schema regex passes 2026-02-31; Date.parse of an out-of-range ISO
    // date is NaN, which is what catches it.
    for (const p of PURCHASES) {
      const dates = [p.pledgedOn, p.deliveredOn, ...p.events.map((e) => e.occurredOn)].filter(
        (d): d is string => d !== null,
      );
      for (const d of dates) {
        expect(Number.isNaN(Date.parse(d)), `${p.id}: ${d}`).toBe(false);
      }
    }
  });

  it("keeps status-dependent fields consistent", () => {
    for (const p of PURCHASES) {
      if (p.status === "delivered") {
        expect(p.deliveredOn, `${p.id} is delivered without deliveredOn`).not.toBeNull();
      }
      if (p.currentEtaMonth !== null) {
        expect(p.originalEtaMonth, `${p.id} has a current ETA but no original`).not.toBeNull();
      }
    }
  });

  it("keeps each status on its kind's pipeline", () => {
    for (const p of PURCHASES) {
      if (p.kind === "retail") {
        expect(["fundraising", "production"], `${p.id}: retail can't be ${p.status}`).not.toContain(
          p.status,
        );
      } else {
        expect(p.status, `${p.id}: a crowdfunding pledge is never a preorder`).not.toBe("preorder");
      }
    }
  });

  it("keeps each timeline ascending by occurredOn", () => {
    for (const p of PURCHASES) {
      const dates = p.events.map((e) => e.occurredOn);
      expect(dates, `${p.id} events out of order`).toEqual([...dates].sort());
    }
  });
});

describe("purchasesForUser", () => {
  it("returns only the requested owner's records", () => {
    for (const record of purchasesForUser("nobody-with-this-id")) {
      expect(record.userId).toBe("nobody-with-this-id");
    }
  });
});
