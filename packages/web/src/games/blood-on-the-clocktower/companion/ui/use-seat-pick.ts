import { useState } from "react";

// The wizard's pick-a-seat gesture, shared by every step that points at a
// player before confirming: tap selects, tapping again clears. Pre-confirm
// state only — anything the Storyteller has CONFIRMED goes to core via a
// reducer, never lives here.

export type SeatPick = {
  seat: number | undefined;
  /** Tap handler for `SeatPicker`: select, or clear when already selected. */
  toggle: (seat: number) => void;
  clear: () => void;
  /** `[seat]` or `[]`, the shape `SeatPicker`'s `selected` wants. */
  selected: number[];
};

export function useSeatPick(): SeatPick {
  const [seat, setSeat] = useState<number | undefined>();
  return {
    seat,
    toggle: (s) => setSeat((prev) => (prev === s ? undefined : s)),
    clear: () => setSeat(undefined),
    selected: seat === undefined ? [] : [seat],
  };
}

export type SeatPair = {
  seats: number[];
  /** Tap handler: toggles membership, keeping the two most recent picks. */
  toggle: (seat: number) => void;
  clear: () => void;
  /** Both picks made. */
  ready: boolean;
};

/** Two-seat variant (Fortune Teller, Innkeeper, Chambermaid). */
export function useSeatPair(): SeatPair {
  const [seats, setSeats] = useState<number[]>([]);
  return {
    seats,
    toggle: (s) =>
      setSeats((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev.slice(-1), s])),
    clear: () => setSeats([]),
    ready: seats.length === 2,
  };
}
