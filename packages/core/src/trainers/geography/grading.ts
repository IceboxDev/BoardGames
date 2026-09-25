import type { SrsGrade } from "../srs.ts";
import { countryOf, type GeoCatalog } from "./catalog.ts";
import type { ContinentId, Place } from "./content-types.ts";

// Automatic grading: the learner never grades themself. Both directions
// end in one of four outcomes:
//   wrong (or "I don't know")               → again
//   right with a hint, a near miss, a typo  → hard
//   right                                   → good
//   right, clean and quick                  → easy
// The geometry (what lies under a click, how far off it is) is measured by
// the web's globe; the rules live here, pure.

/**
 * correct — on it · close — just outside, still counts · near — further out:
 * a miss while a place climbs its stages, forgiven in later reviews · wrong.
 */
export type Verdict = "correct" | "close" | "near" | "wrong";

export interface GradeInput {
  verdict: Verdict;
  hint: boolean;
  /** An accepted misspelling (Name cards). */
  typo?: boolean;
  durationMs: number;
  direction: "locate" | "name";
}

/** Quick enough to count as effortless, per direction. */
export const FAST_MS = { locate: 5_000, name: 6_000 } as const;

export function gradeOf(g: GradeInput): SrsGrade {
  if (g.verdict === "wrong") return "again";
  if (g.verdict === "close" || g.verdict === "near" || g.hint || g.typo) return "hard";
  return g.durationMs < FAST_MS[g.direction] ? "easy" : "good";
}

// ── Locate ─────────────────────────────────────────────────────────────

/** What the globe measured for a click. */
export interface ClickFacts {
  /** Quizzed country under the click (id), if any. */
  countryId: string | null;
  /** Continents the land under the click counts for (a territory: its own). */
  continents: readonly ContinentId[];
  /** Is the click inside the target's polygon (countries)? */
  insideTarget: boolean;
  /** Great-circle km from the click to the target: its outline for a country, the point for a city or a tiny country. */
  distanceKm: number;
  /** Another quizzed city the click landed on (within its own margin), if any. */
  cityId?: string | null;
}

export const LOCATE = {
  /** A coast click this close to a country still counts. */
  COAST_KM: 30,
  /** Close enough to count, for a country. */
  COUNTRY_CLOSE_KM: 75,
  /** Near miss for a country. */
  COUNTRY_NEAR_KM: 150,
  /** Tiny countries are points: a hit within this. */
  TINY_KM: 60,
  CITY_MIN_KM: 25,
  CITY_MAX_KM: 100,
  /** Beyond the margin: up to this multiple still counts… */
  CLOSE_FACTOR: 1.75,
  /** …and up to this one is a near miss. */
  NEAR_FACTOR: 3,
} as const;

/** How close a click must be to a city: scales with the size of its country. */
export function cityToleranceKm(countryAreaKm2: number): number {
  const t = 0.1 * Math.sqrt(Math.max(0, countryAreaKm2));
  return Math.min(LOCATE.CITY_MAX_KM, Math.max(LOCATE.CITY_MIN_KM, t));
}

export interface LocateResult {
  verdict: Verdict;
  /** Another place the click named instead (for contrast follow-ups). */
  confusedWith: string | null;
}

export function judgeLocate(catalog: GeoCatalog, target: Place, click: ClickFacts): LocateResult {
  const other = click.countryId && click.countryId !== target.id ? click.countryId : null;
  if (target.kind === "continent") {
    if (click.continents.includes(target.code)) return { verdict: "correct", confusedWith: null };
    const clicked = click.continents[0];
    return {
      verdict: "wrong",
      confusedWith: clicked ? (catalog.continentByCode.get(clicked)?.id ?? null) : null,
    };
  }
  if (target.kind === "country") {
    if (click.insideTarget) return { verdict: "correct", confusedWith: null };
    if (target.tiny) {
      if (click.distanceKm <= LOCATE.TINY_KM) return { verdict: "correct", confusedWith: null };
      if (click.distanceKm <= LOCATE.TINY_KM * LOCATE.CLOSE_FACTOR) {
        return { verdict: "close", confusedWith: null };
      }
      if (click.distanceKm <= LOCATE.TINY_KM * LOCATE.NEAR_FACTOR) {
        return { verdict: "near", confusedWith: null };
      }
      return { verdict: "wrong", confusedWith: other };
    }
    if (click.distanceKm <= LOCATE.COAST_KM && !other) {
      return { verdict: "correct", confusedWith: null };
    }
    if (click.distanceKm <= LOCATE.COUNTRY_CLOSE_KM)
      return { verdict: "close", confusedWith: null };
    if (click.distanceKm <= LOCATE.COUNTRY_NEAR_KM) return { verdict: "near", confusedWith: null };
    return { verdict: "wrong", confusedWith: other };
  }
  const country = countryOf(catalog, target);
  const tol = cityToleranceKm(country?.areaKm2 ?? 0);
  if (click.distanceKm <= tol) return { verdict: "correct", confusedWith: null };
  if (click.distanceKm <= tol * LOCATE.CLOSE_FACTOR)
    return { verdict: "close", confusedWith: null };
  if (click.distanceKm <= tol * LOCATE.NEAR_FACTOR) return { verdict: "near", confusedWith: null };
  // A mix-up is with another city clicked right on — never with the country
  // under the click (missing Lyon in Switzerland isn't confusing it with Switzerland).
  const otherCity = click.cityId && click.cityId !== target.id ? click.cityId : null;
  return { verdict: "wrong", confusedWith: otherCity };
}

// ── Name ───────────────────────────────────────────────────────────────

const ARTICLES = new Set(["the", "die", "der", "das", "le", "la", "les", "el", "al"]);
const SAINT = new Set(["st", "ste", "saint", "sankt", "san", "santa", "sao"]);

/**
 * Folded for comparison: no accents or case, punctuation and hyphens as
 * spaces, leading articles dropped, every "St."/"Sankt"/"Saint" alike.
 */
export function foldName(s: string): string {
  const words = s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/&/g, " and ")
    .replace(/[„“”"‚‘’'`´.,()]/g, "")
    .replace(/[-‐–—/]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (SAINT.has(w) ? "saint" : w));
  while (words.length > 1 && ARTICLES.has(words[0])) words.shift();
  return words.join(" ");
}

/** German spelling without umlauts: ä → ae, ö → oe, ü → ue (before folding). */
function umlautVariant(s: string): string {
  return s
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae")
    .replace(/Ö/g, "Oe")
    .replace(/Ü/g, "Ue");
}

const acceptedCache = new WeakMap<object, string[]>();

/** Every accepted spelling of a place, folded. */
export function acceptedNames(place: Pick<Place, "nameEn" | "nameDe" | "aliases">): string[] {
  const hit = acceptedCache.get(place);
  if (hit) return hit;
  const raw = [place.nameEn, place.nameDe, ...place.aliases];
  const out = [...new Set(raw.flatMap((n) => [foldName(n), foldName(umlautVariant(n))]))].filter(
    Boolean,
  );
  acceptedCache.set(place, out);
  return out;
}

/** Optimal string alignment distance (Levenshtein + adjacent transpositions). */
export function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => {
    const row = new Array<number>(n + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, d[i - 2][j - 2] + 1);
      }
      d[i][j] = v;
    }
  }
  return d[m][n];
}

/** Misspellings tolerated for a name of this (folded) length. */
export function typoAllowance(length: number): number {
  if (length <= 3) return 0;
  if (length <= 5) return 1;
  if (length <= 10) return 2;
  return 3;
}

export interface NameResult {
  verdict: "correct" | "wrong";
  typo: boolean;
  /** Another place whose name was typed instead. */
  confusedWith: string | null;
}

/**
 * Judge a typed name. An exact spelling of the target wins; an exact
 * spelling of ANOTHER place is always wrong (Austria for Australia, Niger
 * for Nigeria); otherwise a close misspelling of the target is accepted
 * unless it is even closer to another place's name.
 */
export function judgeName(catalog: GeoCatalog, target: Place, typed: string): NameResult {
  const input = foldName(typed);
  if (!input) return { verdict: "wrong", typo: false, confusedWith: null };
  const own = acceptedNames(target);
  if (own.includes(input)) return { verdict: "correct", typo: false, confusedWith: null };

  // Candidates the learner may have meant: same kind, and countries for cities
  // (a country's name typed for its capital is a telling mix-up).
  const rivals = catalog.places.filter(
    (p) =>
      p.id !== target.id &&
      (p.kind === target.kind || (target.kind === "city" && p.kind === "country")),
  );
  for (const p of rivals) {
    if (acceptedNames(p).includes(input)) {
      return { verdict: "wrong", typo: false, confusedWith: p.id };
    }
  }
  const ownDistance = Math.min(...own.map((n) => editDistance(input, n)));
  const allowed = Math.max(...own.map((n) => typoAllowance(n.length)));
  if (ownDistance > allowed) {
    return { verdict: "wrong", typo: false, confusedWith: closestRival(rivals, input) };
  }
  for (const p of rivals) {
    for (const n of acceptedNames(p)) {
      if (editDistance(input, n) < ownDistance) {
        return { verdict: "wrong", typo: false, confusedWith: p.id };
      }
    }
  }
  return { verdict: "correct", typo: true, confusedWith: null };
}

function closestRival(rivals: readonly Place[], input: string): string | null {
  let best: string | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (const p of rivals) {
    for (const n of acceptedNames(p)) {
      const d = editDistance(input, n);
      if (d <= typoAllowance(n.length) && d < bestD) {
        bestD = d;
        best = p.id;
      }
    }
  }
  return best;
}
