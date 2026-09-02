// Purchase manager routes — the read-only pipeline over crowdfunding pledges
// and preorders shown on `/u/:userId/collection?tab=purchases`.
//
//   GET /api/purchases/users/:userId → the owner's tracked purchases
//
// There are no write endpoints by design: the data is the checked-in module
// `@boardgames/core/purchases/data`, maintained code-side (campaign posts get
// folded in by a Claude session and shipped with the deploy). Serving it
// through the server — instead of letting web import the module — is what
// keeps the private fields out of the client bundle: any member may view any
// member's pipeline, but `pledgedOn`, `pledgeCents`, `shippingCents` and
// `note` stay between the owner and admins (the collection's visibility
// rule, reused verbatim).

import { PurchasesResponseSchema } from "@boardgames/core/protocol";
import { type PurchaseRecord, purchasesForUser } from "@boardgames/core/purchases/data";
import { authedApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { errorResponse } from "../lib/error-response.ts";
import { canEditCollection } from "./collection.ts";

export const purchaseRoutes = authedApp();

// Test seam: the data module is a compile-time constant, so tests inject
// fixtures here instead of monkey-patching the import.
let dataOverride: readonly PurchaseRecord[] | null = null;
export function __setPurchasesDataForTests(records: readonly PurchaseRecord[] | null): void {
  dataOverride = records;
}

purchaseRoutes.get("/users/:userId", async (c) => {
  const userId = c.req.param("userId");
  const editable = canEditCollection(c.get("user"), userId);

  const userResult = await getDb().execute({
    sql: `SELECT 1 FROM "user" WHERE id = ? LIMIT 1`,
    args: [userId],
  });
  if (userResult.rows.length === 0) {
    return errorResponse(c, 404, "user not found", "NOT_FOUND");
  }

  const records =
    dataOverride !== null
      ? dataOverride.filter((p) => p.userId === userId)
      : purchasesForUser(userId);
  const purchases = records.map(({ userId: _owner, ...p }) =>
    // Money and private notes stay between the owner and admins.
    editable ? p : { ...p, pledgedOn: null, pledgeCents: null, shippingCents: null, note: null },
  );

  return c.json(PurchasesResponseSchema.parse({ ownerId: userId, editable, purchases }));
});
