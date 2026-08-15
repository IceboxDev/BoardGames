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

/** How a night's attendance credit was earned. */
export type AttendanceVia = "played" | "rsvp";

/**
 * Per-night attribution over the same rule set: `"played"` (rule 1),
 * `"rsvp"` (rule 2), or `null` (no credit). Keys follow `pastNights` order.
 */
export function attributeNightsAttended({
  pastNights,
  rsvpYesNights,
  nightsWithMatches,
  playedNights,
}: NightsAttendedInput): Map<string, AttendanceVia | null> {
  const byNight = new Map<string, AttendanceVia | null>();
  for (const night of pastNights) {
    if (playedNights.has(night)) {
      byNight.set(night, "played");
    } else if (rsvpYesNights.has(night) && !nightsWithMatches.has(night)) {
      byNight.set(night, "rsvp");
    } else {
      byNight.set(night, null);
    }
  }
  return byNight;
}

export function countNightsAttended(input: NightsAttendedInput): number {
  let attended = 0;
  for (const via of attributeNightsAttended(input).values()) {
    if (via !== null) attended++;
  }
  return attended;
}
