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
 *   - not sharing a stem with a face-up word (simple inflections per language),
 *     not an irregular form of one (BROKEN, MICE) and not its other spelling
 *     (THEATRE / THEATER)
 *   - neither starts/ends with a face-up word nor is the start/end of one
 *     (compounds), when the shorter of the two is at least 3 letters — also
 *     once one derivational prefix is stripped from either word
 *
 * The first three are a **form** of the table word: never a clue. The last is
 * only **spelling** — SPARROW holds ROW, LAND ends ENGLAND — and the rulebook
 * ("Don't be too strict") leaves that to the opposing spymaster: Codenames
 * asks them (`clueVerdict`), Duet has no one to ask and stays strict
 * (`clueProblem`).
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

/** Endings that make a form of a word ("any form of a visible word", rulebook). */
const FORM_ENDINGS: Record<Language, readonly string[]> = {
  en: ["s", "es", "d", "ed", "ing", "er", "ers", "est", "ly", "y"],
  de: [
    "e",
    "en",
    "n",
    "er",
    "ern",
    "es",
    "s",
    "st",
    "t",
    "te",
    "ten",
    "ung",
    "ungen",
    "chen",
    "lein",
  ],
};

const VOWEL_START = /^[aeiouy]/;

/**
 * Whether the longer of two folded words is the shorter plus an ending —
 * HORSE → HORSES, RUN → RUNNING (a doubled consonant), MAKE → MAKING (a
 * dropped e), PARTY → PARTIES. The stem trimmer alone misses these.
 */
function isInflection(fa: string, fb: string, language: Language): boolean {
  const [short, long] = fa.length <= fb.length ? [fa, fb] : [fb, fa];
  if (short.length < MIN_OVERLAP || short === long) return false;
  for (const end of FORM_ENDINGS[language]) {
    if (long === short + end) return true;
    if (language !== "en" || !VOWEL_START.test(end)) continue;
    if (long === short + short.slice(-1) + end) return true;
    if (short.endsWith("e") && long === short.slice(0, -1) + end) return true;
    if (short.endsWith("y") && long === `${short.slice(0, -1)}i${end}`) return true;
  }
  return false;
}

/**
 * English words whose forms aren't the word plus an ending: irregular verbs
 * (the rulebook's own example — "until BREAK is covered up by a card, you
 * can't say break, broken…") and plurals. One group per `|`; two words of a
 * group are forms of one word. A `~` marks a form that is also a word of its
 * own (FOUND a city, a SAW, a ROSE): only spelling ties it to the group, so
 * it goes to the opposing spymaster instead of being refused.
 */
const IRREGULAR_EN = `arise arose arisen|awake awoke awoken|bear ~bore borne ~born|beat beaten|become became|begin began begun|bend bent|bind ~bound|bite ~bit bitten|bleed bled|blow blew blown|break broke broken|breed bred|bring brought|build built|burn burnt|buy bought|catch caught|choose chose chosen|cling clung|come came|creep crept|deal dealt|dig dug|do did done|draw drew drawn|dream dreamt|drink drank drunk|drive drove driven|eat ate eaten|fall ~fell fallen|feed ~fed|feel ~felt|fight fought|find ~found|flee fled|fling flung|fly flew flown flies|forbid forbade forbidden|forget forgot forgotten|forgive forgave forgiven|freeze froze frozen|get got gotten|give gave given|go went gone goes|grind ~ground|grow grew grown|hang hung|have had has|hear heard|hide hid hidden|hold held|keep kept|kneel knelt|know knew known|lay laid|lead led|lean leant|leap leapt|learn learnt|leave ~left|lend lent|lie ~lay lain|light ~lit|lose lost|make made|mean meant|meet met|pay paid|prove proven|ride rode ridden|ring rang rung|rise ~rose risen|run ran|say said|see ~saw seen|seek sought|sell sold|send sent|sew sewn|shake shook shaken|shine shone|shoot shot|show shown|shrink shrank shrunk|sing sang sung|sink sank sunk|sit sat|sleep slept|slide slid|sling slung|speak spoke spoken|speed sped|spend spent|spin spun|spit ~spat|spring sprang sprung|stand stood|steal ~stole stolen|stick stuck|sting stung|stink stank stunk|stride strode stridden|strike struck stricken|string strung|strive strove striven|swear swore sworn|sweep swept|swim swam swum|swing swung|take took taken|teach taught|tear tore torn|tell told|think thought|throw threw thrown|tread trod trodden|understand understood|wake woke woken|wear wore worn|weave wove woven|weep wept|win won|wind ~wound|write wrote written|child children|foot feet|goose geese|louse lice|man men|mouse mice|ox oxen|person people|tooth teeth|woman women|knife knives|leaf leaves|life lives|loaf loaves|wife wives|wolf wolves|half halves|calf calves|shelf shelves|thief thieves|elf elves|cactus cacti|fungus fungi|nucleus nuclei|crisis crises|thesis theses|phenomenon phenomena|criterion criteria|good better best|bad worse worst|far farther further`;

interface IrregularEntry {
  group: number;
  /** Also a word of its own: a clash with it is spelling, not a form. */
  homograph: boolean;
}

function irregularTable(source: string): ReadonlyMap<string, IrregularEntry[]> {
  const table = new Map<string, IrregularEntry[]>();
  for (const [group, words] of source.split("|").entries()) {
    for (const raw of words.split(" ")) {
      const word = raw.replace("~", "");
      table.set(word, [...(table.get(word) ?? []), { group, homograph: raw.startsWith("~") }]);
    }
  }
  return table;
}

const IRREGULAR: Record<Language, ReadonlyMap<string, IrregularEntry[]>> = {
  en: irregularTable(IRREGULAR_EN),
  de: new Map(),
};

/**
 * Whether two folded words are forms of one irregular word: `"form"` for
 * BROKEN and BREAK, `"spelling"` when one of them is a word of its own too
 * (FOUND and FIND), null when they aren't.
 */
function irregularClash(fa: string, fb: string, language: Language): Clash | null {
  const table = IRREGULAR[language];
  const entriesOf = (w: string) => [
    ...(table.get(w) ?? []),
    ...(stemOf(w, language) !== w ? (table.get(stemOf(w, language)) ?? []) : []),
  ];
  const eb = entriesOf(fb);
  let clash: Clash | null = null;
  for (const a of entriesOf(fa)) {
    for (const b of eb) {
      if (a.group !== b.group) continue;
      if (!a.homograph && !b.homograph) return "form";
      clash = "spelling";
    }
  }
  return clash;
}

/** Words the respelling below would wrongly merge with another word (TIMBRE is not TIMBER). */
const DISTINCT_SPELLINGS = new Set(["timbre", "timbres", "prise", "prised", "prises", "prising"]);

/**
 * One spelling of a word that is spelled two ways — British and American
 * English ("you can't use t-h-e-a-t-r-e when THEATER is on the table.
 * Theatre and theater are different forms of the same word"). Both words are
 * brought to the American spelling before they are compared.
 */
function oneSpelling(folded: string, language: Language): string {
  if (language !== "en" || folded.length < 5 || DISTINCT_SPELLINGS.has(folded)) return folded;
  return folded
    .replace(/([^aeiou])re(s|d)?$/, "$1er$2") // theatre, centres, fibred
    .replace(/our(s|ed|ing|ite|ites|able)?$/, "or$1") // colour, flavoured, favourite
    .replace(/is(e|es|ed|ing|ation|ations|er|ers)$/, "iz$1") // organise, realisation
    .replace(/ys(e|es|ed|ing)$/, "yz$1") // analyse
    .replace(/ogue(s)?$/, "og$1") // catalogue
    .replace(/([aeiou])ll(ed|ing|er|ers)$/, "$1l$2"); // travelled, modelling
}

/**
 * How two words clash under the clue rules:
 *   - `"form"`: the same word, a shared inflection stem, the word plus an
 *     inflection ending (HORSES, RUNNING, MAKING for HORSE, RUN, MAKE), an
 *     irregular form (BROKEN for BREAK, MICE for MOUSE) or the other spelling
 *     of it (THEATRE for THEATER, COLOUR for COLOR)
 *   - `"spelling"`: one starts or ends the other (SPARROW and ROW), also once
 *     a derivational prefix is stripped from either (SUBATOMIC and ATOM)
 *   - `null`: no clash
 */
export type Clash = "form" | "spelling";

export function clashOf(a: string, b: string, language: Language): Clash | null {
  const fa = foldWord(a);
  const fb = foldWord(b);
  if (fa === fb || stemOf(a, language) === stemOf(b, language) || isInflection(fa, fb, language)) {
    return "form";
  }
  const irregular = irregularClash(fa, fb, language);
  if (irregular === "form") return "form";
  const sa = oneSpelling(fa, language);
  const sb = oneSpelling(fb, language);
  if (
    (sa !== fa || sb !== fb) &&
    (sa === sb || stemOf(sa, language) === stemOf(sb, language) || isInflection(sa, sb, language))
  ) {
    return "form";
  }
  if (irregular === "spelling" || compoundClash(fa, fb)) return "spelling";
  for (const va of withoutPrefixes(fa, language)) {
    for (const vb of withoutPrefixes(fb, language)) {
      if (va === fa && vb === fb) continue;
      // Behind a prefix even a whole word is only spelling: RELATE holds LATE.
      if (compoundClash(va, vb) || stemOf(va, language) === stemOf(vb, language)) {
        return "spelling";
      }
    }
  }
  return null;
}

/**
 * Whether two words clash under the clue rules at all: a form or a spelling
 * clash. The deal uses it to keep HORSE and HORSESHOE off one board.
 */
export function wordsClash(a: string, b: string, language: Language): boolean {
  return clashOf(a, b, language) !== null;
}

/** What is wrong with the word as a single token, or `null` when it is one. */
function tokenProblem(word: string): string | null {
  const trimmed = word.normalize("NFKC").trim();
  if (trimmed.length === 0) return "Type a clue first.";
  if (trimmed.length > MAX_CLUE_LENGTH) return `A clue is at most ${MAX_CLUE_LENGTH} letters.`;
  if (!TOKEN.test(trimmed)) return "A clue is one word — letters only, no spaces or digits.";
  return null;
}

/**
 * Why `word` can't be a clue on a table showing `faceUpWords`, or `null` when
 * it can. Strict: a spelling clash is refused too (Duet, the AI fallback).
 * The message is shown to the spymaster as-is.
 */
export function clueProblem(
  word: string,
  faceUpWords: readonly string[],
  language: Language,
): string | null {
  const verdict = clueVerdict(word, faceUpWords, language);
  if (verdict.kind === "ok") return null;
  if (verdict.kind === "hard") return verdict.message;
  return `"${cleanClueWord(word)}" is too close to ${verdict.clash.toUpperCase()}, which is on the table.`;
}

/**
 * A clue against the table, as Codenames rules on it:
 *   - `ok`: give it
 *   - `hard`: never a clue — not one word, or a form of a table word
 *   - `soft`: only spelling ties it to `clash`, a face-down word; the
 *     opposing spymaster may allow it (rulebook, "Don't be too strict")
 */
export type ClueVerdict =
  | { kind: "ok" }
  | { kind: "hard"; message: string }
  | { kind: "soft"; message: string; clash: string };

export function clueVerdict(
  word: string,
  faceUpWords: readonly string[],
  language: Language,
): ClueVerdict {
  const token = tokenProblem(word);
  if (token !== null) return { kind: "hard", message: token };
  const clean = cleanClueWord(word);
  let soft: string | null = null;
  for (const faceUp of faceUpWords) {
    const clash = clashOf(clean, faceUp, language);
    if (clash === "form") {
      return {
        kind: "hard",
        message: `"${clean}" is too close to ${faceUp.toUpperCase()}, which is on the table.`,
      };
    }
    if (clash === "spelling" && soft === null) soft = faceUp;
  }
  if (soft === null) return { kind: "ok" };
  return {
    kind: "soft",
    clash: soft,
    message: `"${clean}" shares its spelling with ${soft.toUpperCase()}, which is on the table.`,
  };
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
