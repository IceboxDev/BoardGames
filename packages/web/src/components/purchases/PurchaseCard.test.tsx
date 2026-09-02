import type { Purchase } from "@boardgames/core/protocol";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PurchaseCard } from "./PurchaseCard";
import { buildOrderCards, buildPurchaseRows } from "./purchase-rows";

const TODAY = "2026-09-02";

const purchase = (overrides: Partial<Purchase> = {}): Purchase => ({
  id: "frosthaven",
  title: "Frosthaven",
  shortTitle: null,
  orderGroup: null,
  slug: null,
  kind: "crowdfunding",
  status: "shipping",
  platform: "Kickstarter",
  campaignUrl: "https://example.com/campaign",
  pledgeManagerUrl: "https://example.com/orders",
  originalEtaMonth: "2026-05",
  currentEtaMonth: "2026-08",
  pledgedOn: "2025-04-12",
  deliveredOn: null,
  currency: "EUR",
  pledgeCents: 17900,
  shippingCents: 3400,
  note: "Split with Tomas.",
  events: [
    {
      id: "e1",
      occurredOn: "2026-08-27",
      type: "shipping-notice",
      title: "Pallets landed",
      details: null,
      sourceUrl: null,
    },
  ],
  ...overrides,
});

function renderCard(purchases: Purchase | Purchase[], { expanded = false } = {}) {
  const list = Array.isArray(purchases) ? purchases : [purchases];
  const card = buildOrderCards(buildPurchaseRows(list, TODAY), TODAY)[0];
  const onToggle = vi.fn();
  render(
    <ul>
      <PurchaseCard card={card} expanded={expanded} onToggle={onToggle} />
    </ul>,
  );
  return { onToggle };
}

describe("PurchaseCard", () => {
  it("shows the owner total in the purchase's own currency", () => {
    renderCard(purchase());
    expect(screen.getByText("€213")).toBeInTheDocument();
    renderCard(purchase({ id: "usd", title: "USD one", currency: "USD" }));
    expect(screen.getByText("$213")).toBeInTheDocument();
  });

  it("renders nothing money-shaped on a viewer payload", () => {
    renderCard(purchase({ pledgeCents: null, shippingCents: null, note: null, pledgedOn: null }));
    expect(screen.queryByText(/€/)).not.toBeInTheDocument();
  });

  it("keeps overdue in the header but moves slip into the expanded detail", () => {
    renderCard(purchase());
    expect(screen.getByText("overdue")).toBeInTheDocument();
    expect(screen.queryByText(/slipped/)).not.toBeInTheDocument();
    expect(screen.queryByText(/was May 2026/)).not.toBeInTheDocument();
    renderCard(purchase({ id: "p-slip", title: "PS" }), { expanded: true });
    expect(screen.getByText(/slipped 3 mo \(was May 2026\)/)).toBeInTheDocument();
  });

  it("details an early ETA and stays quiet at zero slip", () => {
    renderCard(purchase({ originalEtaMonth: "2026-09", currentEtaMonth: "2026-08" }), {
      expanded: true,
    });
    expect(screen.getByText(/1 mo early \(was Sep 2026\)/)).toBeInTheDocument();
    renderCard(purchase({ id: "p2", title: "P2", originalEtaMonth: "2026-08" }), {
      expanded: true,
    });
    expect(screen.queryByText(/slipped/)).not.toBeInTheDocument();
  });

  it("hardens the single collapsed link; the pledge manager waits in the detail", () => {
    renderCard(purchase());
    const campaign = screen.getByRole("link", { name: "Campaign ↗" });
    expect(campaign).toHaveAttribute("target", "_blank");
    expect(campaign).toHaveAttribute("rel", "noreferrer");
    expect(screen.queryByRole("link", { name: "Pledge manager ↗" })).not.toBeInTheDocument();
    renderCard(purchase({ id: "p-x", title: "PX" }), { expanded: true });
    expect(screen.getByRole("link", { name: "Pledge manager ↗" })).toBeInTheDocument();
  });

  it("promotes the pledge manager to primary when there is no campaign link", () => {
    renderCard(purchase({ campaignUrl: null }));
    expect(screen.getByRole("link", { name: "Pledge manager ↗" })).toBeInTheDocument();
  });

  it("labels a retail campaign link as the shop", () => {
    renderCard(purchase({ kind: "retail", status: "preorder", pledgeManagerUrl: null }));
    expect(screen.getByRole("link", { name: "Shop ↗" })).toBeInTheDocument();
  });

  it("renders no links when the purchase has none", () => {
    renderCard(purchase({ campaignUrl: null, pledgeManagerUrl: null }));
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows the short name collapsed and the full pledge wording expanded, no status badge", () => {
    const p = purchase({ title: "Frosthaven — Big Box (All-In)", shortTitle: "Frosthaven" });
    renderCard(p);
    expect(screen.getByText("Frosthaven")).toBeInTheDocument();
    expect(screen.queryByText("Frosthaven — Big Box (All-In)")).not.toBeInTheDocument();
    // "Shipping" appears exactly once — the rail's stage label, no header badge.
    expect(screen.getAllByText("Shipping")).toHaveLength(1);
    renderCard(purchase({ ...p, id: "p-full" }), { expanded: true });
    expect(screen.getByText("Frosthaven — Big Box (All-In)")).toBeInTheDocument();
  });

  it("dims a cancelled purchase", () => {
    renderCard(purchase({ status: "cancelled" }));
    expect(screen.getByRole("listitem").className).toContain("opacity-60");
  });

  it("folds wave records into one card that expands to per-wave detail", () => {
    const group = { id: "big-pledge", title: "Gloomhaven Grand Festival" };
    const waves = [
      purchase({
        id: "w1",
        title: "Wave 1 — Frosthaven",
        shortTitle: "Frosthaven",
        orderGroup: group,
        status: "delivered",
        deliveredOn: "2026-05-31",
        pledgeCents: 27000,
        shippingCents: null,
        currency: "USD",
      }),
      purchase({
        id: "w2",
        title: "Wave 2 — Minis",
        shortTitle: "Gloomhaven Minis",
        orderGroup: group,
        status: "production",
        originalEtaMonth: "2024-11",
        currentEtaMonth: "2027-02",
        pledgeCents: 32500,
        shippingCents: null,
        currency: "USD",
      }),
    ];
    renderCard(waves);
    // One card, group title, the ACTIVE wave's ETA in the meta — no wave name.
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("Gloomhaven Grand Festival")).toBeInTheDocument();
    expect(screen.getByText(/ETA Feb 2027/)).toBeInTheDocument();
    expect(screen.queryByText(/Gloomhaven Minis ·/)).not.toBeInTheDocument();
    // Money = sum of both waves.
    expect(screen.getByText("$595")).toBeInTheDocument();
    expect(screen.queryByText("Frosthaven")).not.toBeInTheDocument();
    renderCard(
      waves.map((w) => ({ ...w, id: `x-${w.id}` })),
      { expanded: true },
    );
    // Expanded: both waves with their own facts.
    expect(screen.getByText("Frosthaven")).toBeInTheDocument();
    expect(screen.getByText(/Delivered May 31, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/slipped 27 mo \(was Nov 2024\)/)).toBeInTheDocument();
  });

  it("toggles via the header button and reveals note + timeline when expanded", async () => {
    const { onToggle } = renderCard(purchase());
    const button = screen.getByRole("button", { name: /Expand details for Frosthaven/ });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Split with Tomas.")).not.toBeInTheDocument();
    await userEvent.click(button);
    expect(onToggle).toHaveBeenCalledOnce();
    renderCard(purchase({ id: "p3", title: "P3" }), { expanded: true });
    expect(screen.getByText("Split with Tomas.")).toBeInTheDocument();
    expect(screen.getByText("Pallets landed")).toBeInTheDocument();
    expect(screen.getByText("Pledge €179 · Shipping €34 · Total €213")).toBeInTheDocument();
  });
});
