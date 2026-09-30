import type { VariantOption } from "../match-variants";

/**
 * The Trivial Pursuit boxes worth telling apart in the match history — the
 * current Classic box first (a fresh match's default), then the 1981 Genus
 * original and the best-selling spin-offs. Values stay short: they share the
 * 64-character `scenario` with the language ("Lord of the Rings · Italian").
 */
export const TRIVIAL_PURSUIT_EDITIONS: readonly VariantOption[] = [
  { value: "Classic", label: "Classic" },
  { value: "Genus", label: "Genus (1981)" },
  { value: "Master", label: "Master Edition" },
  { value: "Family", label: "Family" },
  { value: "25th Anniversary", label: "25th Anniversary" },
  { value: "2000s", label: "2000s" },
  { value: "Bite Size", label: "Bite Size" },
  { value: "Pop Culture", label: "Pop Culture" },
  { value: "Harry Potter", label: "Harry Potter" },
  { value: "Friends", label: "Friends" },
  { value: "Disney", label: "Disney" },
  { value: "Star Wars", label: "Star Wars" },
  { value: "Lord of the Rings", label: "Lord of the Rings" },
];
