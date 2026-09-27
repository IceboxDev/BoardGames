import { z } from "zod";

/**
 * Length of a multiplayer room code.
 *
 * Shared so the generator (server) and the join form (web) cannot drift — the
 * join button used to hardcode `length === 4` in its own file, which silently
 * rejects every code the moment the server's length changes.
 */
export const ROOM_CODE_LENGTH = 6;

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
   * Seat rank per slot index; identity when absent. Lets the host hand out
   * roles independently of join order for games whose seats carry meaning
   * (Sky Team: seat 0 = Pilot, seat 1 = Co-Pilot) — see the manifest's
   * `seatNames`, the `swap-seats` client message and `roomSeating`.
   */
  seatOrder: z.array(z.number().int().min(0)).optional(),
});
export type RoomState = z.infer<typeof RoomStateSchema>;

/**
 * The in-game seat order of a room: `result[seat]` is the slot index sitting
 * there. Open slots are skipped, so seats are always 0…n−1 with no gaps, and
 * the host's swaps (`seatOrder`) decide the order. The server seats a game
 * with this and the web names players with it, so the two can never disagree.
 */
export function roomSeating(
  slots: readonly RoomSlot[],
  seatOrder: readonly number[] = [],
): number[] {
  const rank = (slot: number) => seatOrder[slot] ?? slot;
  return slots
    .flatMap((slot, i) => (slot.kind === "open" ? [] : [i]))
    .sort((a, b) => rank(a) - rank(b) || a - b);
}
