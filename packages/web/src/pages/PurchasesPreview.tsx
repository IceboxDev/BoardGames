import type { Purchase, PurchasesResponse } from "@boardgames/core/protocol";
import { PurchasesView } from "../components/purchases/PurchasesTab";

// Dev-only preview of the Purchases tab body with fixture data covering every
// visual branch — no auth/network. Owner view (money, Committed tile, spend
// chart) and Visitor view (same purchases, money nulled) side by side.
// Clock pinned to 2026-09-02 so slip/overdue/staleness render predictably.
// /dev/purchases-preview

const TODAY = "2026-09-02";

const base = {
  slug: null,
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
} satisfies Partial<Purchase>;

const PURCHASES: Purchase[] = [
  {
    ...base,
    id: "frosthaven",
    title: "Frosthaven (2nd printing)",
    kind: "crowdfunding",
    status: "shipping",
    platform: "Kickstarter",
    campaignUrl: "https://www.kickstarter.com/projects/frosthaven",
    pledgeManagerUrl: "https://gamefound.com/orders/frosthaven",
    originalEtaMonth: "2026-05",
    currentEtaMonth: "2026-09",
    pledgedOn: "2025-04-12",
    pledgeCents: 17900,
    shippingCents: 3400,
    note: "Split shipping with Tomas — he covers half on delivery.",
    events: [
      {
        id: "frosthaven-e01",
        occurredOn: "2026-06-05",
        type: "campaign-update",
        title: "Print run approved",
        details: "Factory samples signed off; mass production starts next week.",
        sourceUrl: "https://www.kickstarter.com/projects/frosthaven/posts/1",
      },
      {
        id: "frosthaven-e02",
        occurredOn: "2026-06-28",
        type: "delay",
        title: "Freight rebooked — ETA moves to September",
        details: "Container slot lost; new sailing pushes fulfilment by a month.",
        sourceUrl: "https://www.kickstarter.com/projects/frosthaven/posts/2",
      },
      {
        id: "frosthaven-e03",
        occurredOn: "2026-07-20",
        type: "note",
        title: "Confirmed EU-friendly shipping",
        details: null,
        sourceUrl: null,
      },
      {
        id: "frosthaven-e04",
        occurredOn: "2026-08-14",
        type: "status-change",
        title: "Boats sailed — status moves to shipping",
        details: null,
        sourceUrl: null,
      },
      {
        id: "frosthaven-e05",
        occurredOn: "2026-08-27",
        type: "shipping-notice",
        title: "EU hub receiving pallets",
        details: "Wave 1 tracking numbers expected within two weeks.",
        sourceUrl: "https://www.kickstarter.com/projects/frosthaven/posts/3",
      },
    ],
  },
  {
    ...base,
    id: "arcs-leaders",
    title: "Arcs: Leaders & Lore",
    kind: "crowdfunding",
    status: "fundraising",
    platform: "Kickstarter",
    campaignUrl: "https://www.kickstarter.com/projects/arcs",
    originalEtaMonth: "2027-03",
    currentEtaMonth: "2027-03",
    pledgedOn: "2026-08-21",
    pledgeCents: 6400,
    events: [
      {
        id: "arcs-leaders-e01",
        occurredOn: "2026-08-30",
        type: "campaign-update",
        title: "Funded in 40 minutes",
        details: "All stretch goals through the leader packs already unlocked.",
        sourceUrl: null,
      },
    ],
  },
  {
    ...base,
    id: "oath-reprint",
    title: "Oath reprint",
    kind: "crowdfunding",
    status: "production",
    platform: "Gamefound",
    campaignUrl: "https://gamefound.com/en/projects/oath",
    originalEtaMonth: "2026-10",
    currentEtaMonth: "2026-10",
    pledgedOn: "2026-01-18",
    pledgeCents: 9800,
    shippingCents: 1900,
    events: [
      {
        id: "oath-reprint-e01",
        occurredOn: "2026-05-30",
        type: "campaign-update",
        title: "Files at the printer",
        details: null,
        sourceUrl: null,
      },
    ],
  },
  {
    ...base,
    id: "parks-preorder",
    title: "PARKS (new edition)",
    slug: "parks",
    kind: "retail",
    status: "preorder",
    platform: "Keymaster shop",
    pledgeManagerUrl: "https://keymastergames.com/orders/123",
    originalEtaMonth: "2026-07",
    currentEtaMonth: "2026-08",
    pledgedOn: "2026-05-06",
    currency: "USD",
    pledgeCents: 4900,
    events: [
      {
        id: "parks-preorder-e01",
        occurredOn: "2026-07-02",
        type: "delay",
        title: "Restock pushed to August",
        details: null,
        sourceUrl: null,
      },
    ],
  },
  {
    ...base,
    id: "sleeves-early",
    title: "Premium sleeve bundle",
    kind: "crowdfunding",
    status: "shipping",
    platform: "Gamefound",
    originalEtaMonth: "2026-10",
    currentEtaMonth: "2026-09",
    pledgedOn: "2026-06-11",
    pledgeCents: 2600,
    events: [
      {
        id: "sleeves-early-e01",
        occurredOn: "2026-08-25",
        type: "shipping-notice",
        title: "Shipping a month early",
        details: null,
        sourceUrl: null,
      },
    ],
  },
  {
    ...base,
    id: "jaipur-copy",
    title: "Jaipur (travel copy)",
    slug: "jaipur",
    kind: "retail",
    status: "delivered",
    platform: "Local shop",
    pledgedOn: "2026-06-20",
    deliveredOn: "2026-07-15",
    pledgeCents: 2200,
    events: [
      {
        id: "jaipur-copy-e01",
        occurredOn: "2026-07-15",
        type: "status-change",
        title: "Picked up in store",
        details: null,
        sourceUrl: null,
      },
    ],
  },
  {
    ...base,
    id: "dice-tower-kit",
    title: "Walnut dice tower kit",
    kind: "crowdfunding",
    status: "delivered",
    platform: "Kickstarter",
    pledgedOn: "2025-11-02",
    deliveredOn: "2026-04-03",
    pledgeCents: 5200,
    shippingCents: 1100,
    events: [],
  },
  {
    ...base,
    id: "mini-epics",
    title: "Mini epics terrain set",
    kind: "crowdfunding",
    status: "cancelled",
    platform: "Kickstarter",
    pledgedOn: "2026-02-14",
    pledgeCents: 8000,
    events: [
      {
        id: "mini-epics-e01",
        occurredOn: "2026-04-01",
        type: "campaign-update",
        title: "Campaign cancelled, pledges refunded",
        details: "Creator pulled the campaign after manufacturing quotes doubled.",
        sourceUrl: null,
      },
    ],
  },
];

const owner: PurchasesResponse = { ownerId: "u1", editable: true, purchases: PURCHASES };
const visitor: PurchasesResponse = {
  ownerId: "u1",
  editable: false,
  purchases: PURCHASES.map((p) => ({
    ...p,
    pledgedOn: null,
    pledgeCents: null,
    shippingCents: null,
    note: null,
  })),
};

export default function PurchasesPreview() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-10 p-6">
      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-fg-primary">Owner view (money visible)</h2>
        <PurchasesView data={owner} firstName="Mantas" todayKey={TODAY} />
      </section>
      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-fg-primary">Visitor view (money nulled)</h2>
        <PurchasesView data={visitor} firstName="Mantas" todayKey={TODAY} />
      </section>
    </div>
  );
}
