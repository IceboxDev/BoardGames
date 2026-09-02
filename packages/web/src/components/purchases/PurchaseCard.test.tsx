import type { Purchase } from "@boardgames/core/protocol";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PurchaseCard } from "./PurchaseCard";
import { buildPurchaseRows } from "./purchase-rows";

const TODAY = "2026-09-02";

const purchase = (overrides: Partial<Purchase> = {}): Purchase => ({
  id: "frosthaven",
  title: "Frosthaven",
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

function renderCard(p: Purchase, { expanded = false } = {}) {
  const row = buildPurchaseRows([p], TODAY)[0];
  const onToggle = vi.fn();
  render(
    <ul>
      <PurchaseCard row={row} expanded={expanded} onToggle={onToggle} />
    </ul>,
  );
  return { onToggle };
}

describe("PurchaseCard", () => {
  it("shows the owner money line in the purchase's own currency", () => {
    renderCard(purchase());
    expect(screen.getByText("€179 + €34 ship")).toBeInTheDocument();
    renderCard(purchase({ id: "usd", title: "USD one", currency: "USD" }));
    expect(screen.getByText("$179 + $34 ship")).toBeInTheDocument();
  });

  it("renders nothing money-shaped on a viewer payload", () => {
    renderCard(purchase({ pledgeCents: null, shippingCents: null, note: null, pledgedOn: null }));
    expect(screen.queryByText(/€/)).not.toBeInTheDocument();
  });

  it("badges a slipped ETA and an overdue purchase", () => {
    renderCard(purchase());
    expect(screen.getByText("slipped 3 mo")).toBeInTheDocument();
    expect(screen.getByText("overdue")).toBeInTheDocument();
    expect(screen.getByText(/ETA Aug 2026 \(was May 2026\)/)).toBeInTheDocument();
  });

  it("badges an early ETA and skips the badge at zero slip", () => {
    renderCard(purchase({ originalEtaMonth: "2026-09", currentEtaMonth: "2026-08" }));
    expect(screen.getByText("1 mo early")).toBeInTheDocument();
    renderCard(purchase({ id: "p2", title: "P2", originalEtaMonth: "2026-08" }));
    expect(screen.queryByText(/slipped/)).not.toBeInTheDocument();
  });

  it("hardens the external links and drops them when absent", () => {
    renderCard(purchase());
    const campaign = screen.getByRole("link", { name: "Campaign ↗" });
    expect(campaign).toHaveAttribute("target", "_blank");
    expect(campaign).toHaveAttribute("rel", "noreferrer");
    expect(screen.getByRole("link", { name: "Shop ↗" })).toBeInTheDocument();
  });

  it("renders no links when the purchase has none", () => {
    renderCard(purchase({ campaignUrl: null, pledgeManagerUrl: null }));
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("dims a cancelled purchase", () => {
    renderCard(purchase({ status: "cancelled" }));
    expect(screen.getByRole("listitem").className).toContain("opacity-60");
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
