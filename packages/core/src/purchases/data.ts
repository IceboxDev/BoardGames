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
// ── How to fold a pasted campaign post into this file ──────────────────
// 1. Find the purchase by `id` or `title` (the owner names it alongside the
//    post). New purchase: short kebab `id`, `userId` copied from that owner's
//    existing entries, `kind` = crowdfunding (Kickstarter/Gamefound pledge)
//    or retail (shop preorder), money in EUR cents, `slug` only when the
//    game already exists in the catalog.
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

export const PURCHASES: readonly PurchaseRecord[] = [] satisfies readonly PurchaseRecord[];

export function purchasesForUser(userId: string): PurchaseRecord[] {
  return PURCHASES.filter((p) => p.userId === userId);
}
