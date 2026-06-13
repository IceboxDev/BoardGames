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
  /**
   * Maps slot index → in-game seat (PlayerIndex). Identity when absent.
   * Lets the host hand out roles independently of join order for games
   * whose seats carry meaning (Sky Team: seat 0 = Pilot, seat 1 =
   * Co-Pilot) — see `GameRoomConfig.seatNames` and the `swap-seats`
   * client message.
   */
  seatOrder: z.array(z.number().int().min(0)).optional(),
});
export type RoomState = z.infer<typeof RoomStateSchema>;
