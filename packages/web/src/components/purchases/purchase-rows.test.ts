import {
  type Purchase,
  PurchaseEventTypeSchema,
  PurchaseStatusSchema,
} from "@boardgames/core/protocol";
import { describe, expect, it } from "vitest";
import {
  applyPurchaseView,
  buildInsights,
  buildPurchaseRows,
  EVENT_META,
  formatEtaMonth,
  formatEuroCents,
  isOverdue,
  railFor,
  STATUS_LABEL,
  STATUS_TONE,
  slipMonths,
  stalenessDays,
} from "./purchase-rows";

const TODAY = "2026-09-02";

const purchase = (overrides: Partial<Purchase> & { id: string }): Purchase => ({
  title: overrides.id,
  slug: null,
  kind: "crowdfunding",
  status: "production",
  platform: null,
  campaignUrl: null,
  pledgeManagerUrl: null,
  originalEtaMonth: null,
  currentEtaMonth: null,
  pledgedOn: null,
  deliveredOn: null,
  pledgeCents: null,
  shippingCents: null,
  note: null,
  events: [],
  ...overrides,
});

const event = (id: string, occurredOn: string) => ({
  id,
  occurredOn,
  type: "campaign-update" as const,
  title: "Update",
  details: null,
  sourceUrl: null,
});

describe("status / event vocabularies", () => {
  it("cover every protocol enum member", () => {
    for (const status of PurchaseStatusSchema.options) {
      expect(STATUS_LABEL[status].length).toBeGreaterThan(0);
      expect(STATUS_TONE[status]).toBeDefined();
    }
    for (const type of PurchaseEventTypeSchema.options) {
      expect(EVENT_META[type].label.length).toBeGreaterThan(0);
    }
  });
});

describe("slipMonths", () => {
  it("counts across year boundaries, both directions", () => {
    expect(slipMonths("2025-12", "2026-02")).toBe(2);
    expect(slipMonths("2026-06", "2026-06")).toBe(0);
    expect(slipMonths("2026-10", "2026-09")).toBe(-1);
  });

  it("is null while either end is unknown", () => {
    expect(slipMonths(null, "2026-02")).toBeNull();
    expect(slipMonths("2026-02", null)).toBeNull();
  });
});

describe("formatEtaMonth / formatEuroCents", () => {
  it("renders months and money deterministically", () => {
    expect(formatEtaMonth("2026-11")).toBe("Nov 2026");
    expect(formatEuroCents(8900)).toBe("€89");
    expect(formatEuroCents(8999)).toBe("€89.99");
    expect(formatEuroCents(0)).toBe("€0");
    expect(formatEuroCents(179000)).toBe("€1,790");
    expect(formatEuroCents(123456)).toBe("€1,234.56");
  });
});

describe("isOverdue", () => {
  it("flags only an active purchase whose ETA month has fully passed", () => {
    expect(isOverdue("2026-08", "shipping", TODAY)).toBe(true);
    expect(isOverdue("2026-09", "shipping", TODAY)).toBe(false);
    expect(isOverdue("2026-08", "delivered", TODAY)).toBe(false);
    expect(isOverdue("2026-08", "cancelled", TODAY)).toBe(false);
    expect(isOverdue(null, "shipping", TODAY)).toBe(false);
  });
});

describe("stalenessDays", () => {
  it("counts from the latest event; empty timelines aren't stale", () => {
    expect(stalenessDays([], TODAY)).toBeNull();
    expect(stalenessDays([event("e1", "2026-08-03")], TODAY)).toBe(30);
    expect(stalenessDays([event("e1", "2026-08-04"), event("e2", "2026-06-01")], TODAY)).toBe(29);
  });
});

describe("railFor", () => {
  it("gives crowdfunding four stops and retail three", () => {
    expect(railFor("crowdfunding", "shipping")).toEqual({
      stops: ["fundraising", "production", "shipping", "delivered"],
      activeIndex: 2,
    });
    expect(railFor("retail", "preorder")).toMatchObject({ activeIndex: 0 });
    expect(railFor("retail", "preorder")?.stops).toHaveLength(3);
  });

  it("has no rail for cancelled or off-path statuses", () => {
    expect(railFor("crowdfunding", "cancelled")).toBeNull();
    expect(railFor("crowdfunding", "preorder")).toBeNull();
    expect(railFor("retail", "fundraising")).toBeNull();
  });
});

const fixture = () =>
  buildPurchaseRows(
    [
      purchase({
        id: "b-late",
        status: "shipping",
        originalEtaMonth: "2026-05",
        currentEtaMonth: "2026-08",
        pledgeCents: 100,
        events: [event("e1", "2026-05-01")],
      }),
      purchase({
        id: "a-soon",
        status: "production",
        originalEtaMonth: "2026-10",
        currentEtaMonth: "2026-10",
        pledgeCents: 5000,
        shippingCents: 500,
        pledgedOn: "2026-01-15",
        events: [event("e2", "2026-08-30")],
      }),
      purchase({
        id: "c-no-eta",
        status: "fundraising",
        pledgedOn: "2026-01-20",
        pledgeCents: 200,
      }),
      purchase({
        id: "d-done",
        status: "delivered",
        deliveredOn: "2026-07-01",
        events: [event("e3", "2026-07-01")],
      }),
      purchase({ id: "e-dead", status: "cancelled" }),
    ],
    TODAY,
  );

describe("applyPurchaseView", () => {
  it("groups all-scope attention-first: in flight, delivered, cancelled", () => {
    const groups = applyPurchaseView(fixture(), { scope: "all", sort: "eta" });
    expect(groups.map((g) => g.label)).toEqual(["In flight", "Delivered", "Cancelled"]);
    // ETA ascending, missing ETA last.
    expect(groups[0].rows.map((r) => r.purchase.id)).toEqual(["b-late", "a-soon", "c-no-eta"]);
  });

  it("narrow scopes are flat and honour the chosen sort", () => {
    const active = applyPurchaseView(fixture(), { scope: "active", sort: "spend" });
    expect(active).toHaveLength(1);
    expect(active[0].label).toBeNull();
    expect(active[0].rows.map((r) => r.purchase.id)).toEqual(["a-soon", "c-no-eta", "b-late"]);
    const ended = applyPurchaseView(fixture(), { scope: "ended", sort: "eta" });
    expect(ended[0].rows.map((r) => r.purchase.id)).toEqual(["e-dead"]);
  });

  it("drops empty groups", () => {
    const rows = buildPurchaseRows([purchase({ id: "only", status: "production" })], TODAY);
    expect(applyPurchaseView(rows, { scope: "all", sort: "eta" }).map((g) => g.key)).toEqual([
      "active",
    ]);
    expect(applyPurchaseView(rows, { scope: "arrived", sort: "eta" })).toEqual([]);
  });
});

describe("buildInsights", () => {
  it("derives counts, next arrival, and money sums", () => {
    const insights = buildInsights(fixture(), TODAY);
    expect(insights.total).toBe(5);
    expect(insights.activeCount).toBe(3);
    expect(insights.byStatus.shipping).toBe(1);
    expect(insights.overdueCount).toBe(1); // b-late's Aug ETA has passed
    expect(insights.staleCount).toBe(1); // b-late last moved in May
    // The overdue August ETA is not "next arrival" — October is.
    expect(insights.nextArrival).toEqual({ etaMonth: "2026-10", title: "a-soon" });
    expect(insights.committedCents).toBe(100 + 5000 + 500 + 200);
    expect(insights.spendByMonth).toEqual([{ month: "2026-01", cents: 5700 }]);
  });

  it("reports no money when every money field is nulled (viewer payload)", () => {
    const rows = buildPurchaseRows(
      [
        purchase({ id: "x", status: "production" }),
        purchase({ id: "y", status: "delivered", deliveredOn: "2026-01-01" }),
      ],
      TODAY,
    );
    const insights = buildInsights(rows, TODAY);
    expect(insights.committedCents).toBeNull();
    expect(insights.spendByMonth).toEqual([]);
  });
});
