import { z } from "zod";
import { isCatalogSlug } from "../../games/catalog.ts";
import { GameSlugSchema } from "../common.ts";
import { OnlineModeSchema } from "./auth.ts";

/**
 * A user's owned-games list (or the pending-inventory queue). Capped at 200.
 *
 * Shape only — this does NOT check the slug names a real game. Use it for reads
 * and responses, so that retiring a slug from the catalog never turns a stored
 * row into an unreadable one.
 */
export const SlugListSchema = z.array(GameSlugSchema).max(200);
export type SlugList = z.infer<typeof SlugListSchema>;

/**
 * A slug list where every entry must name a game in the catalog. Use it for
 * request bodies: a slug that resolves to no game is silently dropped from
 * availability, so an inventory holding `villainous-introduction-to-evil` (an
 * *edition*, not a game) means its owner never shows as owning Villainous.
 * Reject it at the boundary instead of storing an unresolvable reference.
 */
export const CatalogSlugListSchema = SlugListSchema.superRefine((slugs, ctx) => {
  slugs.forEach((slug, i) => {
    if (!isCatalogSlug(slug)) {
      ctx.addIssue({
        code: "custom",
        path: [i],
        message: `Unknown game slug "${slug}" — not present in the catalog`,
      });
    }
  });
});
export type CatalogSlugList = z.infer<typeof CatalogSlugListSchema>;

/** `PUT` body for user inventory (slugs only). */
export const SetInventoryBodySchema = z.object({
  slugs: CatalogSlugListSchema,
});
export type SetInventoryBody = z.infer<typeof SetInventoryBodySchema>;

/** `PUT` response — server returns the deduped, persisted slug list. */
export const InventoryWriteResponseSchema = z.object({
  ok: z.literal(true),
  slugs: SlugListSchema,
});
export type InventoryWriteResponse = z.infer<typeof InventoryWriteResponseSchema>;

// ── Pending inventory (admin pre-register queue) ────────────────────────
// Carries both the queued slugs and the queued `onlineMode` that get stamped
// onto the next signup. Empty slugs + `offline` mode is the "cleared" state
// (the server deletes the row).

export const PendingInventorySchema = z.object({
  slugs: SlugListSchema,
  onlineMode: OnlineModeSchema,
});
export type PendingInventory = z.infer<typeof PendingInventorySchema>;

// Not an alias of `PendingInventorySchema`: that one also parses the stored row
// on the read path, where a stale slug must not throw. Only the write body
// enforces catalog membership.
export const SetPendingInventoryBodySchema = z.object({
  slugs: CatalogSlugListSchema,
  onlineMode: OnlineModeSchema,
});
export type SetPendingInventoryBody = z.infer<typeof SetPendingInventoryBodySchema>;

export const PendingInventoryWriteResponseSchema = z.object({
  ok: z.literal(true),
  slugs: SlugListSchema,
  onlineMode: OnlineModeSchema,
});
export type PendingInventoryWriteResponse = z.infer<typeof PendingInventoryWriteResponseSchema>;
