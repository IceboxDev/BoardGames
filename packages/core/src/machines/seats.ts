/**
 * Seats at START. The server decides who sits where — humans bound to sockets,
 * AI seats with a strategy the manifest offers — and hands the seating to the
 * game's `buildStart`. A client never names seats directly: a solo request
 * lists seat kinds, which the server checks against the manifest.
 */

import { z } from "zod";

/** What a seat is at START. Humans are bound to sockets by the server. */
export type StartSeat =
  | { readonly kind: "human" }
  | { readonly kind: "ai"; readonly strategy: string };

/** Wire shape of a seat in a solo `create-session` request. */
export const SeatRequestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("human") }),
  z.object({ kind: z.literal("ai"), strategy: z.string().min(1).max(64) }),
]);
export type SeatRequest = z.infer<typeof SeatRequestSchema>;

/** Seat indices held by people. */
export function humanSeats(seats: readonly StartSeat[]): number[] {
  return seats.flatMap((seat, i) => (seat.kind === "human" ? [i] : []));
}

/** One strategy id per seat, `null` for people — the shape most engines take. */
export function seatStrategies(seats: readonly StartSeat[]): (string | null)[] {
  return seats.map((seat) => (seat.kind === "ai" ? seat.strategy : null));
}

/** The first AI seat's strategy, for games that run every AI seat on one engine. */
export function firstAiStrategy(seats: readonly StartSeat[]): string | null {
  for (const seat of seats) if (seat.kind === "ai") return seat.strategy;
  return null;
}

/**
 * Narrow a strategy id to a game's own union. The server has already checked
 * the id against the manifest, so a miss here is a manifest/engine mismatch —
 * a bug worth failing loudly on.
 */
export function strategyGuard<T extends string>(
  game: string,
  /** The game's ids — a record keyed by them, or its typed strategy list. */
  known: Readonly<Record<T, unknown>> | readonly { readonly id: T }[],
): (id: string) => T {
  const ids: ReadonlySet<string> = new Set(
    Array.isArray(known) ? known.map((s) => s.id) : Object.keys(known),
  );
  const isKnown = (id: string): id is T => ids.has(id);
  return (id) => {
    if (!isKnown(id)) throw new Error(`Unknown ${game} AI strategy "${id}"`);
    return id;
  };
}

/** `seatStrategies` narrowed through a game's guard. */
export function typedSeatStrategies<T extends string>(
  seats: readonly StartSeat[],
  toStrategy: (id: string) => T,
): (T | null)[] {
  return seats.map((seat) => (seat.kind === "ai" ? toStrategy(seat.strategy) : null));
}
