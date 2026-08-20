/** Seat→account mapping value meaning "no account chosen yet". */
export const NOBODY = "";

/**
 * True when two seats resolve to the SAME registered account. Unmapped seats
 * (NOBODY) are ignored — an untouched form has no duplicates, only gaps.
 */
export function hasDuplicateAccounts(chosenIds: readonly string[]): boolean {
  const mapped = chosenIds.filter((id) => id !== NOBODY);
  return new Set(mapped).size !== mapped.length;
}
