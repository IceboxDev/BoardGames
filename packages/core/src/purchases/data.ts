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
] satisfies readonly PurchaseRecord[];

export function purchasesForUser(userId: string): PurchaseRecord[] {
  return PURCHASES.filter((p) => p.userId === userId);
}
