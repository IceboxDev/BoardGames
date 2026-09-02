import { describe, expect, it } from "vitest";
import { EtaMonthSchema, HttpUrlSchema, PurchasesResponseSchema } from "./purchases.ts";

const event = {
  id: "frosthaven-e01",
  occurredOn: "2026-03-12",
  type: "campaign-update",
  title: "Wave 2 hits the EU hub in April",
  details: "All EU pallets cleared customs; fulfilment starts mid-April.",
  sourceUrl: "https://www.kickstarter.com/projects/frosthaven/posts/123",
};

const purchase = {
  id: "frosthaven",
  title: "Frosthaven (2nd printing)",
  shortTitle: "Frosthaven",
  orderGroup: { id: "gloomhaven-festival", title: "Gloomhaven Grand Festival" },
  slug: null,
  kind: "crowdfunding",
  status: "shipping",
  platform: "Kickstarter",
  campaignUrl: "https://www.kickstarter.com/projects/frosthaven",
  pledgeManagerUrl: "https://gamefound.com/orders/abc",
  originalEtaMonth: "2026-01",
  currentEtaMonth: "2026-04",
  pledgedOn: "2025-05-02",
  deliveredOn: null,
  currency: "USD",
  pledgeCents: 17900,
  shippingCents: 3200,
  note: "Split shipping with Tomas.",
  events: [event],
};

describe("PurchasesResponseSchema", () => {
  it("parses a happy-path owner payload", () => {
    const parsed = PurchasesResponseSchema.parse({
      ownerId: "u1",
      editable: true,
      purchases: [purchase, { ...purchase, id: "jaipur-2", slug: "jaipur", events: [] }],
    });
    expect(parsed.purchases[0]?.status).toBe("shipping");
  });

  it("parses a viewer payload with the private fields nulled", () => {
    expect(() =>
      PurchasesResponseSchema.parse({
        ownerId: "u1",
        editable: false,
        purchases: [
          { ...purchase, pledgedOn: null, pledgeCents: null, shippingCents: null, note: null },
        ],
      }),
    ).not.toThrow();
  });

  it("rejects an unknown status", () => {
    const r = PurchasesResponseSchema.safeParse({
      ownerId: "u1",
      editable: true,
      purchases: [{ ...purchase, status: "lost-in-the-mail" }],
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["purchases", 0, "status"]);
  });

  it("rejects a malformed event date", () => {
    const r = PurchasesResponseSchema.safeParse({
      ownerId: "u1",
      editable: true,
      purchases: [{ ...purchase, events: [{ ...event, occurredOn: "12.03.2026" }] }],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.path).toEqual(["purchases", 0, "events", 0, "occurredOn"]);
    }
  });
});

describe("EtaMonthSchema", () => {
  it("accepts real months and rejects month 13 and unpadded months", () => {
    expect(() => EtaMonthSchema.parse("2026-11")).not.toThrow();
    expect(EtaMonthSchema.safeParse("2026-13").success).toBe(false);
    expect(EtaMonthSchema.safeParse("2026-1").success).toBe(false);
  });
});

describe("HttpUrlSchema", () => {
  it("pins the scheme to http(s)", () => {
    expect(() => HttpUrlSchema.parse("https://gamefound.com/en/projects/x")).not.toThrow();
    expect(HttpUrlSchema.safeParse("javascript:alert(1)").success).toBe(false);
    expect(HttpUrlSchema.safeParse("ftp://files.example.com/x").success).toBe(false);
  });
});
