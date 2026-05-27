import { z } from "zod";
import { GameSlugSchema } from "../common.ts";
import { OnlineModeSchema } from "./auth.ts";

/** A user's owned-games list (or the pending-inventory queue). Capped at 200. */
export const SlugListSchema = z.array(GameSlugSchema).max(200);
export type SlugList = z.infer<typeof SlugListSchema>;

/** `PUT` body for user inventory (slugs only). */
export const SetInventoryBodySchema = z.object({
  slugs: SlugListSchema,
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

export const SetPendingInventoryBodySchema = PendingInventorySchema;
export type SetPendingInventoryBody = z.infer<typeof SetPendingInventoryBodySchema>;

export const PendingInventoryWriteResponseSchema = z.object({
  ok: z.literal(true),
  slugs: SlugListSchema,
  onlineMode: OnlineModeSchema,
});
export type PendingInventoryWriteResponse = z.infer<typeof PendingInventoryWriteResponseSchema>;
