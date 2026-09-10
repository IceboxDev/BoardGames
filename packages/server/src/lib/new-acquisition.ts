// "New in the library" lasts until the copy is played: a dated acquisition
// with no recorded match of that game, by that member, on or after the date.
// Nothing to clear — recording the match clears it. Derived here so the
// public collection view can show it without exposing the private date.

/** Whether a copy acquired on `acquiredOn` (a date key) has not been played since. */
export function isNewAcquisition(acquiredOn: string | null, lastPlayedAt: string | null): boolean {
  if (acquiredOn === null) return false;
  if (lastPlayedAt === null) return true;
  // `played_at` is "YYYY-MM-DD HH:MM:SS"; its date-key prefix compares lexically.
  return lastPlayedAt.slice(0, 10) < acquiredOn;
}
