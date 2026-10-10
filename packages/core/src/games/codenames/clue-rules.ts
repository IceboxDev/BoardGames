/**
 * What a spymaster may say. Shared by Codenames and Codenames: Duet, by the
 * server's validator, by the AI sanitizer and by the web composer's inline
 * hint, so all four agree on one rule.
 *
 * The rulebook's rule is "one word, and not a word on the table" — with the
 * table's own word forms and compounds out too ("a clue can't be a form of a
 * visible word, or part of a compound"). Engines can't judge meaning, so the
 * ruling here is mechanical (RULES.md, "Clue rulings"):
 *
 *   - one token of letters (an apostrophe or hyphen inside is fine), ≤ 30
 *   - not equal to a face-up word after folding case, accents, ß and umlauts
 *   - neither starts/ends with a face-up word nor is the start/end of one
 *     (compounds), when the shorter of the two is at least 3 letters
 *   - not sharing a stem with a face-up word (simple inflections per language)
 *
 * Covered (revealed) cards are off the table and no longer restrict clues.
 */

import { z } from "zod";
import type { Language } from "./words";

export const MAX_CLUE_LENGTH = 30;
/** Largest number a clue may carry; anything above is the "unlimited" clue. */
export const MAX_CLUE_COUNT = 9;

export const ClueCountSchema = z.union([
  z.number().int().min(0).max(MAX_CLUE_COUNT),
  z.literal("unlimited"),
]);
export type ClueCount = z.infer<typeof ClueCountSchema>;

export const ClueSchema = z.object({
  word: z.string().trim().min(1).max(MAX_CLUE_LENGTH),
  count: ClueCountSchema,
});
export type Clue = z.infer<typeof ClueSchema>;

const TOKEN = /^\p{L}(?:[\p{L}'’-]*\p{L})?$/u;

/** Case, accents, ß and umlauts folded — the form every comparison uses. */
export function foldWord(text: string): string {
  return text
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[’'-]/g, "");
}

const SUFFIXES: Record<Language, readonly string[]> = {
  en: ["ings", "ing", "ers", "er", "ies", "es", "ed", "s", "y"],
  de: ["ungen", "ung", "chen", "lein", "ern", "en", "er", "es", "e", "n", "s"],
};

/** A crude stem: the folded word with one inflection suffix removed. */
export function stemOf(text: string, language: Language): string {
  const folded = foldWord(text);
  for (const suffix of SUFFIXES[language]) {
    if (folded.endsWith(suffix) && folded.length - suffix.length >= 3) {
      return folded.slice(0, -suffix.length);
    }
  }
  return folded;
}

const MIN_OVERLAP = 3;

/**
 * Derivational prefixes: "subatomic" is sub + a form of ATOM, "unhorsed" un +
 * a form of HORSE (the rulebook's own example). Stripping one before the
 * compound check catches a table word buried behind a prefix.
 */
const PREFIXES: Record<Language, readonly string[]> = {
  en: [
    "counter",
    "hyper",
    "inter",
    "micro",
    "super",
    "trans",
    "ultra",
    "under",
    "anti",
    "fore",
    "mini",
    "over",
    "post",
    "semi",
    "dis",
    "mis",
    "non",
    "out",
    "pre",
    "pro",
    "sub",
    "tri",
    "de",
    "em",
    "en",
    "im",
    "in",
    "re",
    "un",
    "up",
  ],
  de: [
    "unter",
    "ueber",
    "nach",
    "miss",
    "auf",
    "aus",
    "bei",
    "ein",
    "ent",
    "mit",
    "vor",
    "weg",
    "zer",
    "ab",
    "an",
    "be",
    "er",
    "ge",
    "un",
    "ur",
    "ver",
    "zu",
  ],
};

/** The folded word, and the word with each derivational prefix it starts with removed. */
function withoutPrefixes(folded: string, language: Language): string[] {
  const out = [folded];
  for (const prefix of PREFIXES[language]) {
    if (folded.startsWith(prefix) && folded.length - prefix.length >= MIN_OVERLAP) {
      out.push(folded.slice(prefix.length));
    }
  }
  return out;
}

/** Same word, or one a compound part of the other: only a prefix or suffix counts. */
function compoundClash(fa: string, fb: string): boolean {
  if (fa === fb) return true;
  // EAR rules out "earring" but not "heart".
  const [short, long] = fa.length <= fb.length ? [fa, fb] : [fb, fa];
  return short.length >= MIN_OVERLAP && (long.startsWith(short) || long.endsWith(short));
}

/**
 * Whether two words clash under the clue rules: the same word, a compound
 * part, a shared stem — also once a derivational prefix is stripped from
 * either ("subatomic" clashes with ATOM).
 */
export function wordsClash(a: string, b: string, language: Language): boolean {
  const fa = foldWord(a);
  const fb = foldWord(b);
  if (compoundClash(fa, fb)) return true;
  if (stemOf(a, language) === stemOf(b, language)) return true;
  for (const va of withoutPrefixes(fa, language)) {
    for (const vb of withoutPrefixes(fb, language)) {
      if (va === fa && vb === fb) continue;
      if (compoundClash(va, vb) || stemOf(va, language) === stemOf(vb, language)) return true;
    }
  }
  return false;
}

/**
 * Why `word` can't be a clue on a table showing `faceUpWords`, or `null` when
 * it can. The message is shown to the spymaster as-is.
 */
export function clueProblem(
  word: string,
  faceUpWords: readonly string[],
  language: Language,
): string | null {
  const trimmed = word.normalize("NFKC").trim();
  if (trimmed.length === 0) return "Type a clue first.";
  if (trimmed.length > MAX_CLUE_LENGTH) return `A clue is at most ${MAX_CLUE_LENGTH} letters.`;
  if (!TOKEN.test(trimmed)) return "A clue is one word — letters only, no spaces or digits.";
  for (const faceUp of faceUpWords) {
    if (wordsClash(trimmed, faceUp, language)) {
      return `"${trimmed}" is too close to ${faceUp.toUpperCase()}, which is on the table.`;
    }
  }
  return null;
}

/** The clue as it is recorded: trimmed, single-spaced, original casing kept. */
export function cleanClueWord(word: string): string {
  return word.normalize("NFKC").trim();
}

/** How many guesses a clue allows (`null` = as many as the team likes). */
export function guessLimit(count: ClueCount): number | null {
  if (count === "unlimited" || count === 0) return null;
  return count + 1;
}

/** How a clue's number reads ("2", "0", "∞"). */
export function formatClueCount(count: ClueCount): string {
  return count === "unlimited" ? "∞" : String(count);
}
