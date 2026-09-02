import { z } from "zod";
import { PurchaseSchema } from "../protocol/http/purchases.ts";

// The purchase tracker's single source of truth — a checked-in data module,
// not a database table. The owner hands campaign posts (Kickstarter /
// Gamefound updates, shipping notices) to a Claude session, which folds them
// into `PURCHASES` below; typecheck + the adjacent coherence test are the
// validators, and git history is the audit trail. The server reads this via
// `purchasesForUser` and nulls the private fields for non-owners.
//
// `packages/web` must NEVER import this module: pledge amounts would ship in
// the client bundle no matter what the API nulls. Server-only consumption is
// what makes owner-only money real.
//
// ── How to fold a campaign post into this file ─────────────────────────
// 0. For Gamefound campaigns, skip the pasting: run
//    `npx tsx scripts/gamefound-dump.ts <campaign URL>` and read
//    `gamefound-dumps/<slug>/updates.md` plus its `images/` (the
//    infographics carry half the information). Pledge details stay manual —
//    they're auth-gated.
// 1. Find the purchase by `id` or `title` (the owner names it alongside the
//    post). New purchase: short kebab `id`, `userId` copied from that owner's
//    existing entries, `kind` = crowdfunding (Kickstarter/Gamefound pledge)
//    or retail (shop preorder), `currency` = what the pledge was billed in
//    with money in its minor units (cents), `slug` only when the game
//    already exists in the catalog.
// 2. Append ONE event per distinct fact the post states: `occurredOn` = the
//    post's own date (YYYY-MM-DD; ask the owner if the post doesn't say),
//    `type` ∈ status-change | campaign-update | shipping-notice | delay |
//    note, `title` ≤ 140 chars headline, `details` a 1–3 sentence neutral
//    summary of ONLY what the post says, `sourceUrl` when a link was given.
//    Event ids run `<purchaseId>-e<NN>` sequentially; keep each `events`
//    array ascending by `occurredOn`.
// 3. A pipeline move updates `status` AND adds a `status-change` event;
//    delivery also sets `deliveredOn`.
// 4. A new timeline promise updates `currentEtaMonth` only — NEVER touch
//    `originalEtaMonth` after creation (it exists purely for slip tracking).
// 5. Verify: `pnpm --filter @boardgames/core test` + `pnpm typecheck`.

/** The checked-in shape: the wire `Purchase` plus owner attribution. */
export const PurchaseRecordSchema = PurchaseSchema.extend({
  userId: z.string().min(1),
});
export type PurchaseRecord = z.infer<typeof PurchaseRecordSchema>;

export const PURCHASES: readonly PurchaseRecord[] = [
  {
    userId: "1RHEXQQBFFleqhj8CZ86aqgQKIUXv0At", // Mantas
    id: "slay-the-spire-downfall",
    title: "Slay the Spire: Downfall — Collector's Bundle",
    slug: "slay-the-spire",
    kind: "crowdfunding",
    status: "production",
    platform: "Gamefound",
    campaignUrl:
      "https://gamefound.com/en/projects/contention-games/slay-the-spire-the-board-game---downfall",
    pledgeManagerUrl:
      "https://gamefound.com/en/projects/contention-games/slay-the-spire-the-board-game---downfall/yourpledge",
    // First shipping timeline stated by the campaign (Update #2): fulfillment
    // starts April 2027 for regular pledges.
    originalEtaMonth: "2027-04",
    currentEtaMonth: "2027-04",
    pledgedOn: "2026-05-29",
    deliveredOn: null,
    currency: "USD",
    pledgeCents: 31892, // $268.00 bundle + $50.92 tax, paid
    shippingCents: null, // charged later — prices land on Gamefound Dec 2026
    note:
      "Pledge 1707349G — Collector's Bundle ($268.00 + $50.92 tax, paid): Slay the Spire " +
      "Collector's Edition + Downfall Collector's Edition + Downfall Campaign Exclusives, all " +
      "English. Shipping is charged separately once prices land (Dec 2026); orders lock " +
      "Jan–Feb 2027. Not switched to Early Shipping (that variant ships the base-game CE from " +
      "October 2026, bundle price $278).",
    events: [
      {
        id: "slay-the-spire-downfall-e01",
        occurredOn: "2026-07-07",
        type: "campaign-update",
        title: "Late pledges open on Gamefound",
        details:
          "The Kickstarter campaign continues on Gamefound: new backers can join, returning " +
          "backers can change orders, pick a language and pay regional taxes/VAT. Shipping gets " +
          "charged later, in the Pledge Manager phase. A pledge comparison table was published, " +
          "and the Cart of Preparation became selectable wherever a Bag of Preparation is in a " +
          "pledge.",
        sourceUrl:
          "https://gamefound.com/en/projects/contention-games/slay-the-spire-the-board-game---downfall/updates/1",
      },
      {
        id: "slay-the-spire-downfall-e02",
        occurredOn: "2026-09-01",
        type: "campaign-update",
        title: "Pledge Manager open — fulfillment starts April 2027",
        details:
          "Shipping addresses are being collected now. Timeline: shipping prices land on " +
          "Gamefound in December 2026 (log in then to pay), orders lock January/February 2027, " +
          "fulfillment starts April 2027. Downfall demos at PAX West (Sep 4–7), Essen Spiel, " +
          "BGG Con and PAX Unplugged.",
        sourceUrl:
          "https://gamefound.com/en/projects/contention-games/slay-the-spire-the-board-game---downfall/updates/2",
      },
      {
        id: "slay-the-spire-downfall-e03",
        occurredOn: "2026-09-01",
        type: "note",
        title: "Early Shipping option for the base game (October 2026)",
        details:
          "The base-game Collector's Edition can switch to Early Shipping (English only, ships " +
          "from October 2026; bundle variant $278). Downfall and the exclusives are excluded " +
          "and would still arrive in the main wave — this pledge stays on the regular " +
          "April 2027 timeline.",
        sourceUrl:
          "https://gamefound.com/en/projects/contention-games/slay-the-spire-the-board-game---downfall/updates/2",
      },
    ],
  },
  // One Gamefound pledge (063695A), split into its two shipping waves so
  // each carries an honest pipeline status.
  {
    userId: "1RHEXQQBFFleqhj8CZ86aqgQKIUXv0At", // Mantas
    id: "old-kings-crown-quick-delivery",
    title: "The Old King's Crown — Base Game (Quick Delivery)",
    slug: "the-old-kings-crown",
    kind: "crowdfunding",
    status: "delivered",
    platform: "Gamefound",
    campaignUrl: "https://gamefound.com/en/projects/eerie-idol-games/the-old-kings-crown",
    pledgeManagerUrl:
      "https://gamefound.com/en/projects/eerie-idol-games/the-old-kings-crown/yourpledge",
    // Campaign promise for English Quick Delivery was "approx May 2026";
    // the EU wave landed early-to-mid June.
    originalEtaMonth: "2026-05",
    currentEtaMonth: "2026-06",
    pledgedOn: "2026-03-28",
    deliveredOn: "2026-06-15", // approximate — EU wave, exact arrival day not recorded
    currency: "GBP",
    pledgeCents: 6188, // £52.00 + £9.88 tax, paid
    shippingCents: null, // paid separately via the pledge manager; amount not recorded
    note:
      'Pledge 063695A, wave 1 of 2 (order shows "partially shipped"): The Old King\'s Crown ' +
      "base game, 2nd printing, English, Quick Delivery. £52.00 + £9.88 tax, paid; " +
      "quick-delivery shipping was charged separately in the pledge manager (April 2026). " +
      "Arrived ~mid-June 2026 with the EU wave (exact date approximate).",
    events: [
      {
        id: "old-kings-crown-quick-delivery-e01",
        occurredOn: "2026-03-31",
        type: "status-change",
        title: "Campaign closed — quick-delivery copies already on the water",
        details:
          "The campaign ended with English Quick Delivery base games pre-printed and on boats " +
          "to regional fulfilment hubs; fulfilment promised for May–June 2026.",
        sourceUrl:
          "https://gamefound.com/en/projects/eerie-idol-games/the-old-kings-crown/updates/14",
      },
      {
        id: "old-kings-crown-quick-delivery-e02",
        occurredOn: "2026-04-20",
        type: "campaign-update",
        title: "Pledge manager live — quick-delivery addresses due by April 29",
        details:
          "The pledge manager opened (after a three-day tax-calculation delay). Quick Delivery " +
          "backers had to submit address and pay shipping by April 29 to avoid delays; orders " +
          'with add-ons would show as "partially shipped" once the base game leaves the hub.',
        sourceUrl:
          "https://gamefound.com/en/projects/eerie-idol-games/the-old-kings-crown/updates/17",
      },
      {
        id: "old-kings-crown-quick-delivery-e03",
        occurredOn: "2026-05-26",
        type: "shipping-notice",
        title: "EU fulfilment underway via Spiral Galaxy",
        details:
          "Games reached all fulfilment hubs; UK and EU copies (Spiral Galaxy) shipping that " +
          "week and the next.",
        sourceUrl:
          "https://gamefound.com/en/projects/eerie-idol-games/the-old-kings-crown/updates/19",
      },
      {
        id: "old-kings-crown-quick-delivery-e04",
        occurredOn: "2026-06-10",
        type: "status-change",
        title: "All EU orders shipped — copy arrived shortly after",
        details:
          "Every EU/UK order with an on-time survey had left the fulfilment centre; the copy " +
          "arrived in the days after (US and Asia waves ran later, into July–August).",
        sourceUrl:
          "https://gamefound.com/en/projects/eerie-idol-games/the-old-kings-crown/updates/20",
      },
    ],
  },
  {
    userId: "1RHEXQQBFFleqhj8CZ86aqgQKIUXv0At", // Mantas
    id: "old-kings-crown-all-in",
    title: "The Old King's Crown — All-In Add-on Bundle",
    slug: "the-old-kings-crown",
    kind: "crowdfunding",
    status: "production",
    platform: "Gamefound",
    campaignUrl: "https://gamefound.com/en/projects/eerie-idol-games/the-old-kings-crown",
    pledgeManagerUrl:
      "https://gamefound.com/en/projects/eerie-idol-games/the-old-kings-crown/yourpledge",
    // All expansions/add-ons were pitched for Q2 2027 during the campaign
    // (the pre-campaign teaser said Q1 2027, but Q2 was the promise at
    // pledge time) and that date still stands.
    originalEtaMonth: "2027-04",
    currentEtaMonth: "2027-04",
    pledgedOn: "2026-03-28",
    deliveredOn: null,
    currency: "GBP",
    pledgeCents: 19040, // £160.00 + £30.40 tax, paid
    shippingCents: null, // charged before the 2027 wave ships (~Q1–Q2 2027)
    note:
      "Pledge 063695A, wave 2 of 2: Waking Kingdom expansion (renamed Wild Kingdom reprint), " +
      "NEW Songs of Home expansion (+ Golden Ship metal coin gift), Annulet standalone game + " +
      "its metal coins, enamel lore & wooden pieces upgrade, metal influence tokens & cloth " +
      "bag, art print pack, and three sleeve packs — all English. £160.00 + £30.40 tax, paid; " +
      "wave-2 shipping is charged just before dispatch (~Q1–Q2 2027). Pledge manager stays " +
      "open for additions until roughly the end of 2026.",
    events: [
      {
        id: "old-kings-crown-all-in-e01",
        occurredOn: "2026-03-04",
        type: "campaign-update",
        title: "Funded on day one — add-on wave set for Q2 2027",
        details:
          "The campaign funded within a day and passed the first Kickstarter's total. All " +
          "expansions and add-ons (Songs of Home, Waking Kingdom, Annulet, upgrades) were " +
          "scheduled to deliver together in Q2 2027.",
        sourceUrl:
          "https://gamefound.com/en/projects/eerie-idol-games/the-old-kings-crown/updates/5",
      },
      {
        id: "old-kings-crown-all-in-e02",
        occurredOn: "2026-03-31",
        type: "status-change",
        title: "Campaign closed — Songs of Home & Annulet into full development",
        details:
          "Campaign ended March 31 with monthly progress updates promised. Songs of Home and " +
          "Annulet entered their main development stretch (balancing, art, playtesting) ahead " +
          "of manufacturing.",
        sourceUrl:
          "https://gamefound.com/en/projects/eerie-idol-games/the-old-kings-crown/updates/14",
      },
      {
        id: "old-kings-crown-all-in-e03",
        occurredOn: "2026-04-20",
        type: "campaign-update",
        title: "Pledge manager live — open for wave-2 additions until ~end of 2026",
        details:
          "Add-ons can still be added at campaign prices until final production quantities " +
          "lock with the manufacturer; addresses stay editable until the 2027 content reaches " +
          "fulfilment centres.",
        sourceUrl:
          "https://gamefound.com/en/projects/eerie-idol-games/the-old-kings-crown/updates/17",
      },
      {
        id: "old-kings-crown-all-in-e04",
        occurredOn: "2026-08-13",
        type: "campaign-update",
        title: "Development on track — Gen Con showcase, fulfilment partners under review",
        details:
          "Songs of Home and an expanded Annulet were demoed as prototypes at Gen Con 2026; a " +
          "Tabletop Simulator preview of new Kingdom Cards is out via Discord. After the slow " +
          "US/Asia quick-delivery experience, the team is reviewing fulfilment partners for " +
          "the 2027 wave.",
        sourceUrl:
          "https://gamefound.com/en/projects/eerie-idol-games/the-old-kings-crown/updates/23",
      },
    ],
  },
] satisfies readonly PurchaseRecord[];

export function purchasesForUser(userId: string): PurchaseRecord[] {
  return PURCHASES.filter((p) => p.userId === userId);
}
