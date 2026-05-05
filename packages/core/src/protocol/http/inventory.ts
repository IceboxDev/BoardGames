import { z } from "zod";
import { GameSlugSchema } from "../common.ts";

/** A user's owned-games list (or the pending-inventory queue). Capped at 200. */
export const SlugListSchema = z.array(GameSlugSchema).max(200);
export type SlugList = z.infer<typeof SlugListSchema>;

/** `PUT` body for both user inventory and pending inventory. */
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
