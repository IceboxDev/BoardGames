import { z } from "zod";

export const RoomSlotKindSchema = z.enum(["human", "ai", "open"]);
export type RoomSlotKind = z.infer<typeof RoomSlotKindSchema>;

export const RoomSlotSchema = z.object({
  kind: RoomSlotKindSchema,
  playerName: z.string().optional(),
  aiStrategy: z.string().optional(),
  ready: z.boolean(),
  connected: z.boolean(),
});
export type RoomSlot = z.infer<typeof RoomSlotSchema>;

export const RoomStateSchema = z.object({
  gameSlug: z.string(),
  hostName: z.string(),
  slots: z.array(RoomSlotSchema),
});
export type RoomState = z.infer<typeof RoomStateSchema>;
