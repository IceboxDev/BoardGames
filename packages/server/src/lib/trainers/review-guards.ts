// What every trainer's review write path checks before grading: the client
// is the clock (it sends its local `YYYY-MM-DD`), but not an unbounded one,
// and the card must exist in the deck.

import { daysBetween } from "@boardgames/core/trainers/srs";

export const LOCAL_DATE_PAST_DAYS = 30;
export const LOCAL_DATE_FUTURE_DAYS = 1;

/** `localDate` within [UTC today − 30 d, UTC today + 1 d] at `nowIso`. */
export function localDateInWindow(localDate: string, nowIso: string): boolean {
  const delta = daysBetween(nowIso.slice(0, 10), localDate);
  return delta >= -LOCAL_DATE_PAST_DAYS && delta <= LOCAL_DATE_FUTURE_DAYS;
}

export type ReviewRejection = "UNKNOWN_QUESTION" | "DATE_OUT_OF_RANGE";

export class ReviewRejectedError extends Error {
  constructor(
    public readonly code: ReviewRejection,
    message: string,
  ) {
    super(message);
    this.name = "ReviewRejectedError";
  }
}
