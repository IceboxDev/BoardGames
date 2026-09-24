import type { RoomState } from "@boardgames/core/protocol";

// Seat index = table order. The room's `seatOrder` maps slot → seat; a slot
// without one sits at its own index. Only humans get a name — Quiztopia rooms
// have no AI seats, but an open slot must never become "undefined".

export type SeatNames = readonly (string | undefined)[];

export function seatNamesFromRoom(room: RoomState | null): string[] {
  const names: string[] = [];
  if (!room) return names;
  room.slots.forEach((slot, i) => {
    const seat = room.seatOrder?.[i] ?? i;
    if (slot.kind === "human") names[seat] = slot.playerName?.trim() || `Seat ${seat + 1}`;
  });
  return names;
}

export function seatName(names: SeatNames, seat: number | null | undefined): string {
  if (seat == null || seat < 0) return "Nobody";
  return names[seat] ?? `Seat ${seat + 1}`;
}

/** "Anna" for someone else, "You" for the viewer. */
export function seatLabel(names: SeatNames, seat: number | null | undefined, you: number): string {
  if (seat === you) return "You";
  return seatName(names, seat);
}

/** Possessive: "Anna's" / "Your". */
export function seatPossessive(
  names: SeatNames,
  seat: number | null | undefined,
  you: number,
): string {
  if (seat === you) return "Your";
  const n = seatName(names, seat);
  return n.endsWith("s") ? `${n}'` : `${n}'s`;
}
