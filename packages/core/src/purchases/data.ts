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
  {
    userId: "1RHEXQQBFFleqhj8CZ86aqgQKIUXv0At", // Mantas
    id: "ark-nova-3dition",
    title: "Ark Nova 3Dition — Elephant Pledge (Sundrop)",
    slug: "ark-nova",
    kind: "crowdfunding",
    status: "production",
    platform: "Gamefound",
    campaignUrl: "https://gamefound.com/en/projects/kekpop-spiele/ark-nova",
    pledgeManagerUrl: "https://gamefound.com/en/projects/kekpop-spiele/ark-nova/yourpledge",
    // The timeline standing at pledge time (Nov '25 update): shipping
    // Sep–Oct '26, worldwide fulfilment Oct '26. The July '26 per-component
    // timeline moved every component to "start fulfilment end of 2026".
    originalEtaMonth: "2026-10",
    currentEtaMonth: "2026-12",
    pledgedOn: "2026-03-29",
    deliveredOn: null,
    currency: "EUR",
    pledgeCents: 40460, // €320.00 + €60.80 tax (Elephant Sundrop) + €10 + €1.90 (Map Ability PROMOs) + €10 + €1.90 (Arcade promo), paid
    shippingCents: null, // charged once the pledge manager opens (not open yet)
    note:
      "Pledge 2130547W (late pledge — the campaign ran Aug 19–Sep 19 2025): Elephant Pledge " +
      "in Sundrop (€320.00 + €60.80 tax) = everything in 3D (Big Box 1 with 40 special " +
      "buildings + Big Box 2 with 200 enclosures/kiosks/pavilions), acrylic tiles set (incl. " +
      "3D coffee mug), 4 deluxe playerboards + action tiles, 82 metal coins, 350 custom " +
      "sleeves, 2 stitched playmats, 2× BGA map sets. Plus add-ons: Map Ability PROMOs " +
      "(€10.00 + €1.90 — the upgraded 5-building pack) and the 3D Arcade promo building & " +
      "card (€10.00 + €1.90); both get Sundrop free with a Sundrop main pledge. Total paid " +
      "€404.60. NOTE: 3Dition contains NO base game — the retail copy is required. Shipping " +
      "is charged when the pledge manager opens (still closed as of Aug 2026).",
    events: [
      {
        id: "ark-nova-3dition-e01",
        occurredOn: "2025-09-19",
        type: "status-change",
        title: "Campaign closed at €2M+ with 11,000+ backers",
        details:
          "The Gamefound-exclusive campaign ended via the Endgame phase as the most-funded " +
          "German board game crowdfunding campaign ever (and 2025's 2nd biggest board game " +
          "campaign overall).",
        sourceUrl: "https://gamefound.com/en/projects/kekpop-spiele/ark-nova/updates/24",
      },
      {
        id: "ark-nova-3dition-e02",
        occurredOn: "2025-11-07",
        type: "campaign-update",
        title: "Late pledge opens — production timeline set",
        details:
          "Miniature molds started manufacturing in October '25 (the production bottleneck); " +
          "plan: manufacturing Jan–Aug '26, shipping Sep–Oct '26, worldwide fulfilment " +
          "Oct '26. The Map Ability promo pack gained two extra buildings (free for existing " +
          "backers). Pledge manager to follow later for shipping and addresses.",
        sourceUrl: "https://gamefound.com/en/projects/kekpop-spiele/ark-nova/updates/25",
      },
      {
        id: "ark-nova-3dition-e03",
        occurredOn: "2026-03-30",
        type: "campaign-update",
        title: "Mold tooling nearly complete",
        details:
          "Post-Chinese-New-Year production at full speed: the tooling design phase is nearly " +
          "done with actual mold production starting on schedule; coin design advanced and " +
          "deluxe player boards iterating.",
        sourceUrl: "https://gamefound.com/en/projects/kekpop-spiele/ark-nova/updates/28",
      },
      {
        id: "ark-nova-3dition-e04",
        occurredOn: "2026-07-01",
        type: "delay",
        title: "Fulfilment slips to end of 2026",
        details:
          "The new per-component timeline shows every component (sleeves furthest along, " +
          "coins and coffee cup furthest behind) starting fulfilment at the end of 2026 " +
          'instead of October — "quality over speed", with miniature molds the bottleneck.',
        sourceUrl: "https://gamefound.com/en/projects/kekpop-spiele/ark-nova/updates/31",
      },
      {
        id: "ark-nova-3dition-e05",
        occurredOn: "2026-08-02",
        type: "campaign-update",
        title: "Association board approved, arcade cards done in 17 languages",
        details:
          "Milestones completing weekly; the box layout is being finalized from the first " +
          "serial test run to lock packaging weights and dimensions per pledge tier.",
        sourceUrl: "https://gamefound.com/en/projects/kekpop-spiele/ark-nova/updates/32",
      },
    ],
  },
  {
    userId: "1RHEXQQBFFleqhj8CZ86aqgQKIUXv0At", // Mantas
    id: "brass-pittsburgh",
    title: "Brass Collector's Bundle (Pittsburgh + Birmingham + Lancashire) + Iron Coins 100",
    slug: "brass-pittsburgh",
    kind: "crowdfunding",
    status: "production",
    platform: "Gamefound",
    campaignUrl: "https://gamefound.com/en/projects/roxley/brass-pittsburgh",
    pledgeManagerUrl: "https://gamefound.com/en/projects/roxley/brass-pittsburgh/yourpledge",
    // First post-campaign timeline (May '26, #35, unchanged through July):
    // Production Aug '26 → Freight Jan '27 → Fulfilment May '27. The
    // Aug 14 '26 update moved fulfilment to July 2027 (solo-mode dev time).
    originalEtaMonth: "2027-05",
    currentEtaMonth: "2027-07",
    pledgedOn: "2026-03-25",
    deliveredOn: null,
    currency: "USD",
    pledgeCents: 53550, // $350.00 bundle + $66.50 tax + $100.00 Iron Coins 100 + $19.00 tax, paid
    shippingCents: null, // settled in the pledge manager (open through Nov 30, 2026); not recorded yet
    note:
      "Pledge 166560Z: Brass Collector's Bundle ($350.00 + $66.50 tax, paid) = Pittsburgh CE " +
      "(Steel Mill cover) + Birmingham CE + Lancashire CE, plus Iron Coins 100 ($100.00 + " +
      "$19.00 tax) — no storage box, uses the CE cash carriage. Backed on day 2 of the live " +
      "campaign, so every stretch goal applies (numbered CE boxes, hardwood money, birch " +
      "hardwood tokens, dual-layer NoGlare boards) and the Pittsburgh CE includes the 20-print " +
      "Curated Artfolio (live-campaign backers only). Shipping + final charges are settled in " +
      "the pledge manager, open through Nov 30, 2026. CEs are campaign/Roxley-direct exclusive.",
    events: [
      {
        id: "brass-pittsburgh-e01",
        occurredOn: "2026-04-18",
        type: "status-change",
        title: "Campaign closed after a 5-day Endgame",
        details:
          "Set to close April 13, the campaign ran on through Gamefound's Endgame extensions " +
          "until April 18, past $4M. Final unlocks landed along the way: numbered CE boxes and " +
          "the full 20-print Curated Artfolio with cloth-wrapped gold-foil hardcover. Late " +
          "pledge and pledge manager to follow.",
        sourceUrl: "https://gamefound.com/en/projects/roxley/brass-pittsburgh/updates/34",
      },
      {
        id: "brass-pittsburgh-e02",
        occurredOn: "2026-05-07",
        type: "campaign-update",
        title: "First production timeline — fulfilment May 2027",
        details:
          "The standing plan: Production August 2026 → Freight January 2027 → Fulfilment " +
          "May 2027. Development at 85% (Pittsburgh solo mode and Birmingham 2P still in " +
          "testing); pledge manager tentatively May 26, later moved to early July.",
        sourceUrl: "https://gamefound.com/en/projects/roxley/brass-pittsburgh/updates/35",
      },
      {
        id: "brass-pittsburgh-e03",
        occurredOn: "2026-07-03",
        type: "campaign-update",
        title: "Pledge manager opens July 6 — survey deadline August 31",
        details:
          "Confirm the pledge, add add-ons, and pay the remaining balance, shipping and taxes " +
          "at submit; nothing ships until fulfilment in 2027. Refunds run at 90% until the " +
          "pledge manager closes. The deadline was later extended to November 30.",
        sourceUrl: "https://gamefound.com/en/projects/roxley/brass-pittsburgh/updates/39",
      },
      {
        id: "brass-pittsburgh-e04",
        occurredOn: "2026-08-14",
        type: "delay",
        title: "Timeline slips a quarter — fulfilment now July 2027",
        details:
          "Pittsburgh's late-added solo mode (~60% through design and testing) needs more " +
          "development time, moving everything back: freight January → April 2027, fulfilment " +
          "May → July 2027. The pledge manager stays open through November 30, 2026, and a " +
          "new Iron Coins 200 set (adds 50 and 500 denominations) joined the add-ons.",
        sourceUrl: "https://gamefound.com/en/projects/roxley/brass-pittsburgh/updates/43",
      },
      {
        id: "brass-pittsburgh-e05",
        occurredOn: "2026-08-26",
        type: "campaign-update",
        title: "Multiplayer complete, solo mode in design — manufacturing not started",
        details:
          "Latest chart: development 94% (multiplayer done, solo ongoing), art & graphic " +
          "design 90% (solo cards/rulebooks remain), prepress 70% (final coin and clay " +
          "samples ordered; Lancashire and Birmingham in final proofing), manufacturing 0%.",
        sourceUrl: "https://gamefound.com/en/projects/roxley/brass-pittsburgh/updates/44",
      },
    ],
  },
  {
    userId: "1RHEXQQBFFleqhj8CZ86aqgQKIUXv0At", // Mantas
    id: "roma-xli",
    title: 'Roma XLI — "Everything!" Dark Cities Bundle',
    slug: "roma-xli",
    kind: "crowdfunding",
    status: "production",
    platform: "Kickstarter",
    campaignUrl: "https://www.kickstarter.com/projects/facadegames/roma-xli-game",
    pledgeManagerUrl: "https://www.allplay.com/pledge-manager",
    // The Kickstarter pledge itself promised "Estimated delivery Nov 2026";
    // the Aug 25 '26 update still estimates October/November delivery.
    originalEtaMonth: "2026-11",
    currentEtaMonth: "2026-11",
    pledgedOn: "2026-03-25",
    deliveredOn: null,
    currency: "USD",
    pledgeCents: 22500, // $225.00 "Everything!" reward, collected
    shippingCents: null, // Kickstarter estimated $0 worldwide; taxes/shipping confirm via the AllPlay pledge manager
    note:
      'The "Everything!" reward ($225.00, collected): all six Dark Cities deluxe games — ' +
      "Salem 1692, Tortuga 1667, Deadwood 1876, Bristol 1350, Hollywood 1947 and Roma XLI — " +
      "plus the Kickstarter-exclusive Spoils of War and Bounties of Peace mini-expansion " +
      "boxes and Dark Cities Coaster Set, 2× Index book boxes, and the Mat Maximus mat. " +
      "Campaign funded March 26, 2026 (8,000+ backers). Order, taxes and shipping are " +
      "confirmed via the AllPlay pledge manager (live since Aug 2026, open into 2027).",
    events: [
      {
        id: "roma-xli-e01",
        occurredOn: "2026-04-02",
        type: "status-change",
        title: "Campaign funded (March 26) — production begins",
        details:
          "Facade Games moved to finalizing design files and the rulebook before mass " +
          "production, aiming to have everything ready for shipping in late summer or early " +
          "fall 2026. Shipping info to be collected in 3–5 months via a pledge manager that " +
          "won't close early.",
        sourceUrl: "https://www.kickstarter.com/projects/facadegames/roma-xli-game/posts/4652968",
      },
      {
        id: "roma-xli-e02",
        occurredOn: "2026-05-27",
        type: "campaign-update",
        title: "Production underway — files final, first samples in",
        details:
          "All files finalized, the rulebook proofed, and the first production samples of " +
          "final components received; a couple of months of production remained, still on " +
          "plan for late-summer/early-fall shipping readiness.",
        sourceUrl: "https://www.kickstarter.com/projects/facadegames/roma-xli-game/posts/4702663",
      },
      {
        id: "roma-xli-e03",
        occurredOn: "2026-07-24",
        type: "campaign-update",
        title: "Pledge manager (AllPlay) announced for August 12",
        details:
          "Pledge-manager emails from AllPlay start rolling out August 12 to confirm orders, " +
          "addresses and add-ons. The factory is scheduled to finish producing Roma XLI in " +
          "early September, then everything goes on boats to the fulfilment warehouses.",
        sourceUrl: "https://www.kickstarter.com/projects/facadegames/roma-xli-game/posts/4753396",
      },
      {
        id: "roma-xli-e04",
        occurredOn: "2026-08-25",
        type: "campaign-update",
        title: "Pledge manager live — delivery estimated Oct/Nov 2026",
        details:
          "Final advance copies arrived from the factory, with production complete in about " +
          "a week and freight to fulfilment centres next. The AllPlay pledge manager is live " +
          "(link retrievable at allplay.com/pledge-manager) and stays open until 2027; " +
          "delivery currently estimated October/November 2026.",
        sourceUrl: "https://www.kickstarter.com/projects/facadegames/roma-xli-game/posts/4779725",
      },
    ],
  },
  {
    userId: "1RHEXQQBFFleqhj8CZ86aqgQKIUXv0At", // Mantas
    id: "hell-of-a-deal",
    title: "Hell of a Deal + Foil Poker Deck dual pack",
    slug: "hell-of-a-deal",
    kind: "crowdfunding",
    status: "shipping",
    platform: "Kickstarter",
    campaignUrl: "https://www.kickstarter.com/projects/smirkanddagger/hell-of-a-deal",
    pledgeManagerUrl: null, // BackerKit; closed May 15 '26, addresses locked July 18 '26
    // Kickstarter's reward estimate at pledge time: Sep 2026 (the creator's
    // internal goal was July/August). The EU wave lands late September —
    // vessel due in Rotterdam Sep 12, fulfilment ~1–2 weeks after.
    originalEtaMonth: "2026-09",
    currentEtaMonth: "2026-09",
    pledgedOn: "2026-03-25",
    deliveredOn: null,
    currency: "USD",
    pledgeCents: 8500, // $65.00 base game + $20.00 Deluxe Foil Poker Deck dual pack, collected
    shippingCents: null, // shipping + VAT charged separately via BackerKit; amount not recorded
    note:
      "Base pledge ($65.00): premium 1–9p co-op poker game vs hell's bosses — 52 custom " +
      "11.5g poker chips, 6 neoprene poker mats, custom poker deck, 35 Favor / 16 Curse / " +
      "14 tarot-size Boss cards, wood Temptation tokens, gold-foil box, plus all unlocked " +
      "stretch goals (incl. solo mode and 44 bosses, added late campaign). Add-on: Deluxe " +
      "Foil Poker Deck dual pack ($20.00, gold + red). Total $85.00 collected; shipping and " +
      "VAT went through the BackerKit pledge manager. EU copies fulfil via MeeplesNL from " +
      "Rotterdam.",
    events: [
      {
        id: "hell-of-a-deal-e01",
        occurredOn: "2026-04-11",
        type: "status-change",
        title: "Campaign funded (3,735 backers) — straight to press",
        details:
          "The campaign closed April 10/11 and production started immediately: molds for " +
          "dice, chips and wood components were already underway, with print files at the " +
          "printer within days — aiming at one of the fastest Kickstarter turnarounds.",
        sourceUrl:
          "https://www.kickstarter.com/projects/smirkanddagger/hell-of-a-deal/posts/4660857",
      },
      {
        id: "hell-of-a-deal-e02",
        occurredOn: "2026-04-23",
        type: "campaign-update",
        title: "BackerKit pledge manager opens April 28",
        details:
          "BackerKit collects addresses, shipping fees and VAT. Chips and dice hit press " +
          "first (longest lead times); the box was made deeper so the neoprene mats fit " +
          "rolled inside.",
        sourceUrl:
          "https://www.kickstarter.com/projects/smirkanddagger/hell-of-a-deal/posts/4672316",
      },
      {
        id: "hell-of-a-deal-e03",
        occurredOn: "2026-05-11",
        type: "campaign-update",
        title: "Pledge manager closes early (May 15) — printing done end of May",
        details:
          "The pledge manager and late pledges closed May 15 so regional freight could be " +
          "planned; printing was set to finish by the end of May. Address changes stayed " +
          "possible through June/July.",
        sourceUrl:
          "https://www.kickstarter.com/projects/smirkanddagger/hell-of-a-deal/posts/4687816",
      },
      {
        id: "hell-of-a-deal-e04",
        occurredOn: "2026-06-12",
        type: "delay",
        title: "Box-cover misprint forces a full cover reprint",
        details:
          "Every printed box cover came out with the red frame oversaturated into muddy " +
          "brown, so all covers were reprinted and the booked vessel was cancelled — killing " +
          "the internal early-July goal, though the promised timeline still held. Everything " +
          "inside the box (chips, mats, tray) passed inspection.",
        sourceUrl:
          "https://www.kickstarter.com/projects/smirkanddagger/hell-of-a-deal/posts/4718236",
      },
      {
        id: "hell-of-a-deal-e05",
        occurredOn: "2026-07-27",
        type: "status-change",
        title: "On the water — EU wave via Rotterdam (MeeplesNL)",
        details:
          "After three back-to-back setbacks (cover reprint in 9 days, a 10-day Chinese port " +
          "closure, then getting bumped off the rebooked vessel), games shipped by region: " +
          "US fulfilment from ~Aug 5, Canada in port Aug 20, EU/UK bound for the Netherlands " +
          "with MeeplesNL as the new fulfilment partner. Addresses locked July 18.",
        sourceUrl:
          "https://www.kickstarter.com/projects/smirkanddagger/hell-of-a-deal/posts/4750032",
      },
      {
        id: "hell-of-a-deal-e06",
        occurredOn: "2026-08-14",
        type: "campaign-update",
        title: "US wave delivering — EU vessel due Rotterdam September 12",
        details:
          "US backers are receiving games; Canada ships from ~Aug 27. The EU/UK vessel is " +
          "due in Rotterdam September 12, then about a week to the fulfilment centre and " +
          "orders out days later (~late September). Damaged/missing-part replacements mail " +
          "from end of August; the recommended starting boss lineup was revised (Boatman, " +
          "Brothers Dreadful, Demona, Burnie).",
        sourceUrl:
          "https://www.kickstarter.com/projects/smirkanddagger/hell-of-a-deal/posts/4771434",
      },
    ],
  },
  {
    userId: "1RHEXQQBFFleqhj8CZ86aqgQKIUXv0At", // Mantas
    id: "elements-of-truth",
    title: "Elements of Truth — Einsteinium Edition",
    slug: "elements-of-truth",
    kind: "crowdfunding",
    status: "production",
    platform: "Kickstarter",
    campaignUrl:
      "https://www.kickstarter.com/projects/elements-of-truth/elements-of-truth-by-veritasium",
    pledgeManagerUrl: null, // BackerKit survey; closed June 14 '26
    // Kickstarter's reward estimate at pledge time: Sep 2026. Production
    // finished Aug 31 with QC still ahead of freight, so September is tight
    // but no later month has been stated — the recent updates name no dates.
    originalEtaMonth: "2026-09",
    currentEtaMonth: "2026-09",
    pledgedOn: "2025-12-08",
    deliveredOn: null,
    currency: "USD",
    pledgeCents: 9900, // $99.00 Einsteinium Edition, collected
    shippingCents: 1500, // $15.00 worldwide shipping, collected with the pledge
    note:
      "Einsteinium Edition ($99.00, Kickstarter exclusive): the base game plus every " +
      "expansion pack — Community Designed booster, Veritasium, Astronomy, Engineering, " +
      "Physics and Technology question packs (800 questions total) — with neoprene mat, " +
      "6 chip stands and the premium wooden box. $15.00 worldwide shipping collected with " +
      "the pledge; any VAT collected later via BackerKit is not recorded. Campaign funded " +
      "Dec 13, 2025. All editions gained an X bluffing tile and thicker number tiles " +
      "during production.",
    events: [
      {
        id: "elements-of-truth-e01",
        occurredOn: "2026-01-26",
        type: "campaign-update",
        title: "Production design finalizing — first deliveries aimed at August",
        details:
          "Designs and fact-checked questions being finalized, full production set for late " +
          "February, and the community deck's winning artwork revealed. Plan then: first " +
          "deliveries in August, ahead of the September pledge estimate.",
        sourceUrl:
          "https://www.kickstarter.com/projects/elements-of-truth/elements-of-truth-by-veritasium/posts/4594832",
      },
      {
        id: "elements-of-truth-e02",
        occurredOn: "2026-05-18",
        type: "campaign-update",
        title: "X bluffing tile and thicker tiles added to all editions",
        details:
          "Production on track with freight from the manufacturer to fulfilment hubs aimed " +
          "at June. A new X tile enables a bluffing variant, and all editions upgraded to " +
          "thicker number tiles.",
        sourceUrl:
          "https://www.kickstarter.com/projects/elements-of-truth/elements-of-truth-by-veritasium/posts/4694174",
      },
      {
        id: "elements-of-truth-e03",
        occurredOn: "2026-05-29",
        type: "campaign-update",
        title: "BackerKit survey out — address + VAT, deadline extended to June 14",
        details:
          "The survey collects final addresses and location-dependent VAT; extra base " +
          "copies could be added but no additional Veritasium/Einsteinium editions. The " +
          "June 7 deadline was extended to June 14 after Apple Private Relay addresses " +
          "blocked BackerKit's emails.",
        sourceUrl:
          "https://www.kickstarter.com/projects/elements-of-truth/elements-of-truth-by-veritasium/posts/4702499",
      },
      {
        id: "elements-of-truth-e04",
        occurredOn: "2026-07-08",
        type: "campaign-update",
        title: "Final stages of production — timeline details promised soon",
        details:
          "Production photos shared with the game in its final stretch; concrete timeline " +
          "information promised for a later update, with the June freight plan no longer " +
          "mentioned.",
        sourceUrl:
          "https://www.kickstarter.com/projects/elements-of-truth/elements-of-truth-by-veritasium/posts/4737811",
      },
      {
        id: "elements-of-truth-e05",
        occurredOn: "2026-08-31",
        type: "campaign-update",
        title: "Production complete — quality control underway",
        details:
          "The finished product passed into final quality control, the last stage before " +
          "games head to the distribution centers and shipping begins. Next update promised " +
          "when shipping is underway; no delivery month stated.",
        sourceUrl:
          "https://www.kickstarter.com/projects/elements-of-truth/elements-of-truth-by-veritasium/posts/4784662",
      },
    ],
  },
  {
    userId: "1RHEXQQBFFleqhj8CZ86aqgQKIUXv0At", // Mantas
    id: "parks-europe",
    title: "Parks Europe — Chalet Edition + Summit Edition",
    slug: "parks-europe",
    kind: "crowdfunding",
    status: "production",
    platform: "BackerKit",
    campaignUrl:
      "https://www.backerkit.com/c/projects/keymaster/parks-europe-chalet-edition-free-expansion",
    pledgeManagerUrl: null, // BackerKit survey; closed Aug 31 '26, cards charged Sep 1
    // A BackerKit "Ready-to-Ship" campaign — printing ran during the campaign
    // and the page promises "Estimated to ship by October 2026".
    originalEtaMonth: "2026-10",
    currentEtaMonth: "2026-10",
    pledgedOn: "2026-08-03",
    deliveredOn: null,
    currency: "USD",
    pledgeCents: 17998, // $89.99 Chalet Edition + $89.99 Parks Summit Edition add-on, charged Aug 5
    shippingCents: null, // shipping + VAT charged Sep 1 via BackerKit; amount not recorded
    note:
      "Confirmation 1740949: Parks Europe Chalet Edition ($89.99, with the World Heritage " +
      "Sites mini expansion included free) plus the Parks Summit Edition add-on ($89.99). " +
      "Total $179.98 charged Aug 5, 2026; shipping + VAT charged separately Sep 1 via " +
      "BackerKit (amount not recorded), delivered DDP to the EU (Germany address). " +
      "Ready-to-Ship campaign: Panda printed during the campaign and community-reported " +
      "typo errata were folded into the shipped copies. EU boxes carry two extra " +
      "green-directive compliance stickers (same contents, same window).",
    events: [
      {
        id: "parks-europe-e01",
        occurredOn: "2026-08-03",
        type: "campaign-update",
        title: "Gen Con preview — errata folded into the print run",
        details:
          "Preview copies shown at Gen Con while the campaign ran; community-spotted typos " +
          "and errata were sent to Panda for correction in every shipped copy. The box lid " +
          "interior hides a map of all 48 featured Parks. (Date approximate.)",
        sourceUrl:
          "https://www.backerkit.com/c/projects/keymaster/parks-europe-chalet-edition-free-expansion/updates/48416",
      },
      {
        id: "parks-europe-e02",
        occurredOn: "2026-08-06",
        type: "status-change",
        title: "Campaign funded — $582,182 from 5,249 backers, games already printing",
        details:
          "As a Ready-to-Ship campaign the files were done and printing underway before the " +
          "campaign closed. An aggressive pledge-manager/freight/fulfilment timeline targets " +
          "the promised October delivery; ~800 extra copies were offered to backers when the " +
          "pledge manager opened. (Date approximate.)",
        sourceUrl:
          "https://www.backerkit.com/c/projects/keymaster/parks-europe-chalet-edition-free-expansion/updates/49299",
      },
      {
        id: "parks-europe-e03",
        occurredOn: "2026-08-29",
        type: "campaign-update",
        title: "Pledge manager closed Aug 31 — cards charged Sep 1, containers load soon",
        details:
          "Shipping, taxes and add-ons were charged Tuesday Sep 1 (US time); that day's " +
          "BackerKit data routes games from the manufacturer to each region's fulfilment " +
          "hub, with assembly next and containers loading in the coming weeks. EU-bound " +
          "boxes gain two compliance stickers for the EU green-transition directive — same " +
          "ship window. (Date approximate.)",
        sourceUrl:
          "https://www.backerkit.com/c/projects/keymaster/parks-europe-chalet-edition-free-expansion/updates/50907",
      },
    ],
  },
] satisfies readonly PurchaseRecord[];

export function purchasesForUser(userId: string): PurchaseRecord[] {
  return PURCHASES.filter((p) => p.userId === userId);
}
