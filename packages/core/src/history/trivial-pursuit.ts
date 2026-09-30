// Trivial Pursuit's match record: the pie wedges each player (or team) had
// collected when the game ended, plus one crowned winner. Several players can
// hold all six wedges — only the one who then answered the final question in
// the hub won — so the winner is picked, never derived from the wedges.
//
// A wedge is keyed by its board SLOT under the classic Genus colour. Editions
// that print the Arts & Literature slot purple instead of brown (Master
// Edition, 25th Anniversary, …) only change how it's drawn, not the key.
//
// Shared between the core wire schema, the server's outcome allowlist and the
// web form + card, so all of them agree on what a legal wedge set is.

import { z } from "zod";

export const TRIVIAL_PURSUIT_SLUG = "trivial-pursuit";

export const TRIVIAL_PURSUIT_WEDGES = [
  "blue",
  "pink",
  "yellow",
  "brown",
  "green",
  "orange",
] as const;

export const WedgeSchema = z.enum(TRIVIAL_PURSUIT_WEDGES);
export type Wedge = z.infer<typeof WedgeSchema>;

/** A full pie — every slot filled. */
export const FULL_PIE = TRIVIAL_PURSUIT_WEDGES.length;

/** Why a wedge set is illegal, or null. Unknown colours are the schema's job. */
export function describeWedgesError(wedges: readonly string[]): string | null {
  if (new Set(wedges).size !== wedges.length) return "a wedge can only be collected once";
  if (wedges.length > FULL_PIE) return `at most ${FULL_PIE} wedges`;
  return null;
}

/** The wedges in board order — how every form and card lays them out. */
export function sortWedges(wedges: readonly Wedge[]): Wedge[] {
  const held = new Set(wedges);
  return TRIVIAL_PURSUIT_WEDGES.filter((w) => held.has(w));
}
