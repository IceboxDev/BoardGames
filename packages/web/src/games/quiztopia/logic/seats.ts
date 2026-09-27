// Seat index = table order (the session flow names seats from the room).

export type SeatNames = readonly (string | undefined)[];

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
