import {
  type Purchase,
  PurchaseEventTypeSchema,
  PurchaseStatusSchema,
} from "@boardgames/core/protocol";
import { describe, expect, it } from "vitest";
import {
  applyPurchaseView,
  buildInsights,
  buildOrderCards,
  buildPurchaseRows,
  committedEurCents,
  compactTitle,
  displayPurchaseTitle,
  EUR_RATE,
  EVENT_META,
  formatApproxEur,
  formatEtaMonth,
  formatEurTotal,
  formatMoneyCents,
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
  shortTitle: null,
  orderGroup: null,
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
  currency: "EUR",
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

describe("formatEtaMonth / formatMoneyCents / formatEurTotal", () => {
  it("renders months and money deterministically — whole units, one shape", () => {
    expect(formatEtaMonth("2026-11")).toBe("Nov 2026");
    expect(formatMoneyCents(8900, "EUR")).toBe("€89");
    expect(formatMoneyCents(8999, "EUR")).toBe("€90");
    expect(formatMoneyCents(0, "EUR")).toBe("€0");
    expect(formatMoneyCents(179000, "EUR")).toBe("€1,790");
    expect(formatMoneyCents(123456, "EUR")).toBe("€1,235");
    expect(formatMoneyCents(31892, "USD")).toBe("$319");
    expect(formatMoneyCents(25228, "GBP")).toBe("£252");
  });

  it("speaks EUR down the list: exact for EUR, ≈ converted otherwise", () => {
    expect(formatEurTotal(21300, "EUR")).toBe("€213");
    expect(formatEurTotal(21300, "USD")).toBe(`≈ €${Math.round((21300 * EUR_RATE.USD) / 100)}`);
    expect(formatEurTotal(25228, "GBP")).toBe(`≈ €${Math.round((25228 * EUR_RATE.GBP) / 100)}`);
  });
});

describe("compactTitle / displayPurchaseTitle", () => {
  it("prefers the hand-picked short name, else compacts the full title", () => {
    expect(
      displayPurchaseTitle({
        title: "Gloomhaven Grand Festival — Miniatures",
        shortTitle: "Gloomhaven Minis",
      }),
    ).toBe("Gloomhaven Minis");
    expect(
      displayPurchaseTitle({ title: "Elements of Truth — Einsteinium Edition", shortTitle: null }),
    ).toBe("Elements of Truth");
  });

  it("drops the edition/bundle tail, keeps plain names", () => {
    expect(compactTitle("Elements of Truth — Einsteinium Edition")).toBe("Elements of Truth");
    expect(compactTitle('Roma XLI — "Everything!" Dark Cities Bundle')).toBe("Roma XLI");
    expect(compactTitle("Brass Collector's Bundle (Pittsburgh + Birmingham)")).toBe(
      "Brass Collector's Bundle",
    );
    expect(compactTitle("Hell of a Deal + Foil Poker Deck dual pack")).toBe("Hell of a Deal");
    expect(compactTitle("Ark Nova")).toBe("Ark Nova");
  });
});

describe("committedEurCents / formatApproxEur", () => {
  it("folds per-currency totals into one approximate EUR figure", () => {
    expect(committedEurCents([])).toBe(0);
    expect(committedEurCents([{ currency: "EUR", cents: 40460 }])).toBe(40460);
    const mixed = committedEurCents([
      { currency: "EUR", cents: 40460 },
      { currency: "USD", cents: 236340 },
      { currency: "GBP", cents: 25228 },
    ]);
    const expected = Math.round(40460 + 236340 * EUR_RATE.USD + 25228 * EUR_RATE.GBP);
    expect(mixed).toBe(expected);
  });

  it("rounds the estimate to whole euros for display", () => {
    expect(formatApproxEur(273_969)).toBe("≈ €2,740");
    expect(formatApproxEur(40_460)).toBe("≈ €405");
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

const cardsOf = (rows: ReturnType<typeof buildPurchaseRows>) => buildOrderCards(rows, TODAY);

describe("applyPurchaseView", () => {
  it("groups all-scope attention-first: in flight, delivered, cancelled", () => {
    const groups = applyPurchaseView(cardsOf(fixture()), { scope: "all", sort: "eta" });
    expect(groups.map((g) => g.label)).toEqual(["In flight", "Delivered", "Cancelled"]);
    // ETA ascending, missing ETA last.
    expect(groups[0].cards.map((c) => c.key)).toEqual(["b-late", "a-soon", "c-no-eta"]);
  });

  it("narrow scopes are flat and honour the chosen sort", () => {
    const active = applyPurchaseView(cardsOf(fixture()), { scope: "active", sort: "spend" });
    expect(active).toHaveLength(1);
    expect(active[0].label).toBeNull();
    expect(active[0].cards.map((c) => c.key)).toEqual(["a-soon", "c-no-eta", "b-late"]);
    const ended = applyPurchaseView(cardsOf(fixture()), { scope: "ended", sort: "eta" });
    expect(ended[0].cards.map((c) => c.key)).toEqual(["e-dead"]);
  });

  it("drops empty groups", () => {
    const cards = cardsOf(
      buildPurchaseRows([purchase({ id: "only", status: "production" })], TODAY),
    );
    expect(applyPurchaseView(cards, { scope: "all", sort: "eta" }).map((g) => g.key)).toEqual([
      "active",
    ]);
    expect(applyPurchaseView(cards, { scope: "arrived", sort: "eta" })).toEqual([]);
  });
});

describe("buildOrderCards", () => {
  const GROUP = { id: "big-pledge", title: "Big Pledge" };
  const waves = () =>
    buildPurchaseRows(
      [
        purchase({
          id: "w1",
          orderGroup: GROUP,
          status: "delivered",
          deliveredOn: "2026-05-01",
          slug: null,
          pledgeCents: 10000,
          pledgedOn: "2023-07-20",
          events: [event("we1", "2026-05-01")],
        }),
        purchase({
          id: "w2",
          orderGroup: GROUP,
          status: "production",
          currentEtaMonth: "2027-01",
          originalEtaMonth: "2024-11",
          pledgeCents: 5000,
          pledgedOn: "2023-07-20",
          events: [event("we2", "2026-08-26")],
        }),
        purchase({ id: "solo", status: "shipping" }),
      ],
      TODAY,
    );

  it("folds wave records into one card and keeps plain purchases as singletons", () => {
    const cards = buildOrderCards(waves(), TODAY);
    expect(cards.map((c) => c.key)).toEqual(["big-pledge", "solo"]);
    const big = cards[0];
    expect(big.title).toBe("Big Pledge");
    // Attention order: the active wave leads, the delivered one follows.
    expect(big.waves.map((w) => w.purchase.id)).toEqual(["w2", "w1"]);
    // Representative = the active wave, not the delivered one.
    expect(big.rep.purchase.id).toBe("w2");
    expect(big.active).toBe(true);
    expect(big.allDelivered).toBe(false);
    expect(big.totalCents).toBe(15000);
    expect(big.earliestPledgedOn).toBe("2023-07-20");
    // Staleness follows the freshest event across all waves.
    expect(big.staleDays).toBe(7);
  });

  it("is arrived only when every wave has landed", () => {
    const done = buildOrderCards(
      buildPurchaseRows(
        [
          purchase({
            id: "w1",
            orderGroup: GROUP,
            status: "delivered",
            deliveredOn: "2026-05-01",
          }),
          purchase({
            id: "w2",
            orderGroup: GROUP,
            status: "delivered",
            deliveredOn: "2026-07-01",
          }),
        ],
        TODAY,
      ),
      TODAY,
    );
    expect(done[0].allDelivered).toBe(true);
    expect(done[0].active).toBe(false);
    // Representative = the latest delivery.
    expect(done[0].rep.purchase.id).toBe("w2");
  });
});

describe("buildInsights", () => {
  it("derives counts, next arrival, and money sums", () => {
    const insights = buildInsights(cardsOf(fixture()), TODAY);
    expect(insights.total).toBe(5);
    expect(insights.activeCount).toBe(3);
    expect(insights.byStatus.shipping).toBe(1);
    expect(insights.overdueCount).toBe(1); // b-late's Aug ETA has passed
    expect(insights.staleCount).toBe(1); // b-late last moved in May
    // The overdue August ETA is not "next arrival" — October is.
    expect(insights.nextArrival).toEqual({ etaMonth: "2026-10", title: "a-soon" });
    expect(insights.committed).toEqual([{ currency: "EUR", cents: 100 + 5000 + 500 + 200 }]);
    expect(insights.spendByMonth).toEqual([{ month: "2026-01", eurCents: 5700 }]);
  });

  it("keeps currencies apart instead of summing dollars into euros", () => {
    const rows = buildPurchaseRows(
      [
        purchase({ id: "eur", status: "production", pledgedOn: "2026-05-01", pledgeCents: 9800 }),
        purchase({
          id: "usd",
          status: "production",
          currency: "USD",
          pledgedOn: "2026-05-29",
          pledgeCents: 31892,
        }),
      ],
      TODAY,
    );
    const insights = buildInsights(cardsOf(rows), TODAY);
    expect(insights.committed).toEqual([
      { currency: "EUR", cents: 9800 },
      { currency: "USD", cents: 31892 },
    ]);
    // The chart series, unlike `committed`, folds both into approximate EUR.
    expect(insights.spendByMonth).toEqual([
      { month: "2026-05", eurCents: Math.round(9800 + 31892 * EUR_RATE.USD) },
    ]);
  });

  it("reports no money when every money field is nulled (viewer payload)", () => {
    const rows = buildPurchaseRows(
      [
        purchase({ id: "x", status: "production" }),
        purchase({ id: "y", status: "delivered", deliveredOn: "2026-01-01" }),
      ],
      TODAY,
    );
    const insights = buildInsights(cardsOf(rows), TODAY);
    expect(insights.committed).toEqual([]);
    expect(insights.spendByMonth).toEqual([]);
  });
});
