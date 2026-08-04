// "Nights attended" attribution — which past locked game nights a user
// actually gets credit for.
//
// A night counts when either:
//   1. the user appears in at least one recorded match for that night
//      (played = attended, even without an RSVP — covers walk-ins and
//      guests added straight into the match history), or
//   2. the user RSVP'd "yes" AND the night has no recorded matches at all
//      (nothing to contradict the RSVP, so it stands).
//
// The deliberate gap: an RSVP "yes" on a night that HAS matches, none of
// which include the user, earns nothing — the match history outranks the
// RSVP as evidence of who was really there.

export type NightsAttendedInput = {
  /** Every locked night strictly before today (the denominator set). */
  pastNights: readonly string[];
  /** Nights (any date) the user RSVP'd "yes" to. */
  rsvpYesNights: ReadonlySet<string>;
  /** Nights that have at least one match recorded, by anyone. */
  nightsWithMatches: ReadonlySet<string>;
  /** Nights where the user appears in at least one match's participants. */
  playedNights: ReadonlySet<string>;
};

export function countNightsAttended({
  pastNights,
  rsvpYesNights,
  nightsWithMatches,
  playedNights,
}: NightsAttendedInput): number {
  let attended = 0;
  for (const night of pastNights) {
    if (playedNights.has(night)) {
      attended++;
    } else if (rsvpYesNights.has(night) && !nightsWithMatches.has(night)) {
      attended++;
    }
  }
  return attended;
}
