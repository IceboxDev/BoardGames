import type { VariantOption } from "../match-variants";

/** How a box prints the Art & Literature slot: brown (the 1981 original) or purple. */
export type ArtsWedgeColor = "brown" | "purple";

export type TrivialPursuitEdition = VariantOption & { artsWedge: ArtsWedgeColor };

/**
 * The Trivial Pursuit boxes worth telling apart in the match history, with the
 * colour each prints for the Art & Literature slot. Classic first — the box on
 * shelves today and a fresh match's default.
 *
 * The slot was brown from 1981 and turned purple in the mid-2000s. Sources:
 * - Hasbro's own rulebooks: 25th Anniversary (2008, US: "PURPLE … Art &
 *   Literature"); Classic Edition, 40 Jahre and Familienedition (German
 *   rulebooks, purple wedge on the category legend).
 * - de.wikipedia "Trivial Pursuit" › Fragekategorien, whose table colours the
 *   slot per edition: brown for Genus I–III, 1995, 2005 and Deluxe 2007; purple
 *   for Master 2009, Classic 2017, Familien 2014, 40 Jahre, 2000er, Harry
 *   Potter 2015, Herr der Ringe 2018, Star Wars Black 2016 and Party 2020.
 *   (en.wikipedia's edition list files both colours under one column.)
 *
 * Values stay short: they share the 64-character `scenario` with the
 * language ("Lord of the Rings · Italian").
 */
export const TRIVIAL_PURSUIT_EDITIONS: readonly TrivialPursuitEdition[] = [
  { value: "Classic", label: "Classic", artsWedge: "purple" },
  { value: "Genus", label: "Genus (1981–2007)", artsWedge: "brown" },
  { value: "Master", label: "Master Edition", artsWedge: "purple" },
  { value: "Family", label: "Family", artsWedge: "purple" },
  { value: "25th Anniversary", label: "25th Anniversary", artsWedge: "purple" },
  { value: "40th Anniversary", label: "40th Anniversary", artsWedge: "purple" },
  { value: "2000s", label: "2000s", artsWedge: "purple" },
  { value: "Party", label: "Party", artsWedge: "purple" },
  { value: "Harry Potter", label: "Harry Potter", artsWedge: "purple" },
  { value: "Lord of the Rings", label: "Lord of the Rings", artsWedge: "purple" },
  { value: "Star Wars", label: "Star Wars", artsWedge: "purple" },
];
