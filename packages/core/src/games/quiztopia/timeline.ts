// The personal timeline's arithmetic: every question carries one dated
// event (a point, or an interval such as a lifespan, a war or a reign), and
// the trainer pins the events of the questions a member has studied onto one
// chronological river. Pure functions only — parsing the content's date
// strings, a monotonic sort key, formatting in EN/DE, era bucketing and the
// piecewise display scale that squeezes 13.8 billion years and the last
// three centuries onto the same screen.
//
// Date strings: "YYYY" | "YYYY-MM" | "YYYY-MM-DD" with HISTORICAL years —
// a leading minus is BC and there is no year 0 ("-44-03-15" = 15 March
// 44 BC, "-1" = 1 BC). Deep time is a bare year ("-66000000").

export const TIMELINE_KINDS = [
  "event",
  "lifespan",
  "period",
  "reign",
  "creation",
  "founding",
  "discovery",
  "era",
] as const;
export type TimelineKind = (typeof TIMELINE_KINDS)[number];

export const TIMELINE_PRECISIONS = [
  "day",
  "month",
  "year",
  "decade",
  "century",
  "millennium",
  "megayear",
] as const;
export type TimelinePrecision = (typeof TIMELINE_PRECISIONS)[number];

/** Kinds whose `end` (or `ongoing`) makes them a span rather than a moment. */
export const INTERVAL_KINDS: ReadonlySet<TimelineKind> = new Set(["lifespan", "period", "reign"]);

/** The event as it lives in the generated content (camelCase). */
export interface TimelineEvent {
  kind: TimelineKind;
  start: string;
  end: string | null;
  precision: TimelinePrecision;
  approx: boolean;
  ongoing: boolean;
  labelEn: string;
  labelDe: string;
}

export type TimelineLang = "en" | "de";

export interface TimelineDate {
  /** Historical year: negative = BC, never 0. */
  year: number;
  month: number | null;
  day: number | null;
}

// ── Parsing ────────────────────────────────────────────────────────────

export const TIMELINE_DATE_RE = /^(-?)(\d{1,11})(?:-(\d{2})(?:-(\d{2}))?)?$/;

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Parse a content date string, or null when it is malformed (year 0, 31 Feb …). */
export function parseTimelineDate(s: string): TimelineDate | null {
  const m = TIMELINE_DATE_RE.exec(s);
  if (!m) return null;
  const abs = Number(m[2]);
  if (abs === 0 || !Number.isSafeInteger(abs)) return null;
  const year = m[1] ? -abs : abs;
  const month = m[3] ? Number(m[3]) : null;
  const day = m[4] ? Number(m[4]) : null;
  if (month !== null && (month < 1 || month > 12)) return null;
  if (day !== null && month !== null && (day < 1 || day > DAYS_IN_MONTH[month - 1])) return null;
  return { year, month, day };
}

/** Astronomical year numbering: 1 BC → 0, 44 BC → −43. */
export function astronomicalYear(year: number): number {
  return year < 0 ? year + 1 : year;
}

/**
 * A monotonic number for a date, in fractional astronomical years: later
 * dates always compare greater, a bare year sorts at its first day.
 */
export function timelineSortKey(date: TimelineDate): number {
  const month = (date.month ?? 1) - 1;
  const day = (date.day ?? 1) - 1;
  return astronomicalYear(date.year) + month / 12 + day / (12 * 31);
}

/**
 * Strict order for validation, the content checker's rule: missing month or
 * day count as 0, so "1898" < "1898-01" < "1898-01-01".
 */
export function compareTimelineDates(a: TimelineDate, b: TimelineDate): number {
  return a.year - b.year || (a.month ?? 0) - (b.month ?? 0) || (a.day ?? 0) - (b.day ?? 0);
}

/** The precision a date string's shape demands (bare years allow several). */
export function precisionFitsDate(s: string, precision: TimelinePrecision): boolean {
  const parts = s.replace(/^-/, "").split("-").length;
  if (parts === 3) return precision === "day";
  if (parts === 2) return precision === "month";
  return precision !== "day" && precision !== "month";
}

export function isInterval(ev: Pick<TimelineEvent, "end" | "ongoing">): boolean {
  return ev.end !== null || ev.ongoing;
}

export interface ParsedEvent {
  start: TimelineDate;
  end: TimelineDate | null;
  startKey: number;
  /** For an ongoing span the key of `now`; for a point, equal to `startKey`. */
  endKey: number;
}

/** Both ends parsed and keyed; null when a date string is malformed. */
export function parseEvent(
  ev: Pick<TimelineEvent, "start" | "end" | "ongoing">,
  now: TimelineDate = currentDate(),
): ParsedEvent | null {
  const start = parseTimelineDate(ev.start);
  if (!start) return null;
  const end = ev.end === null ? null : parseTimelineDate(ev.end);
  if (ev.end !== null && !end) return null;
  const startKey = timelineSortKey(start);
  const endKey = end
    ? timelineSortKey(end)
    : ev.ongoing
      ? Math.max(startKey, timelineSortKey(now))
      : startKey;
  return { start, end, startKey, endKey };
}

export function currentDate(d: Date = new Date()): TimelineDate {
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

// ── Formatting ─────────────────────────────────────────────────────────

const MONTHS: Record<TimelineLang, readonly string[]> = {
  en: [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ],
  de: [
    "Januar",
    "Februar",
    "März",
    "April",
    "Mai",
    "Juni",
    "Juli",
    "August",
    "September",
    "Oktober",
    "November",
    "Dezember",
  ],
};

function ordinalEn(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

function groupDigits(n: number, lang: TimelineLang): string {
  return n.toLocaleString(lang === "de" ? "de-DE" : "en-GB");
}

/** A year with its era marker: "44 BC", "AD 79", "1841" / „44 v. Chr.“, „79 n. Chr.“. */
function yearText(year: number, lang: TimelineLang, era = true): string {
  const abs = Math.abs(year);
  const digits = abs >= 10_000 ? groupDigits(abs, lang) : String(abs);
  if (year < 0) return era ? `${digits} ${lang === "de" ? "v. Chr." : "BC"}` : digits;
  if (year < 500 && era) return lang === "de" ? `${digits} n. Chr.` : `AD ${digits}`;
  return digits;
}

function bcSuffix(year: number, lang: TimelineLang): string {
  return year < 0 ? (lang === "de" ? " v. Chr." : " BC") : "";
}

/** The century a year stands for; "1200" and "1201" are both the 13th. */
export function centuryOf(year: number): number {
  const abs = Math.abs(year);
  return year > 0 ? Math.floor(abs / 100) + 1 : Math.ceil(abs / 100);
}

export function millenniumOf(year: number): number {
  const abs = Math.abs(year);
  return year > 0 ? Math.floor((abs - 1) / 1000) + 1 : Math.ceil(abs / 1000);
}

function yearsAgo(year: number, approx: boolean, lang: TimelineLang): string {
  const ago = Math.abs(year);
  let value: string;
  if (ago >= 1e9) {
    const v = Number((ago / 1e9).toPrecision(3));
    const num = lang === "de" ? String(v).replace(".", ",") : String(v);
    value = lang === "de" ? `${num} ${v === 1 ? "Milliarde" : "Milliarden"}` : `${num} billion`;
  } else if (ago >= 1e6) {
    const v = Number((ago / 1e6).toPrecision(3));
    const num = lang === "de" ? String(v).replace(".", ",") : String(v);
    value = lang === "de" ? `${num} ${v === 1 ? "Million" : "Millionen"}` : `${num} million`;
  } else {
    value = groupDigits(ago, lang);
  }
  if (lang === "de") return `vor ${approx ? "etwa " : ""}${value} Jahren`;
  return `${approx ? "c. " : ""}${value} years ago`;
}

/** One date at one precision, without the interval wrapping. */
export function formatDatePart(
  date: TimelineDate,
  precision: TimelinePrecision,
  lang: TimelineLang,
  approx = false,
): string {
  const { year, month, day } = date;
  const c = lang === "en" && approx ? "c. " : "";
  const um = lang === "de" && approx ? "um " : "";
  switch (precision) {
    case "megayear":
      return yearsAgo(year, approx, lang);
    case "millennium": {
      if (Math.abs(year) >= 100_000) return yearsAgo(year, approx, lang);
      const m = millenniumOf(year);
      if (lang === "de") {
        if (approx) return `um ${yearText(year, lang)}`;
        return `${m}. Jahrtausend${bcSuffix(year, lang)}`;
      }
      return `${c}${ordinalEn(m)} millennium${bcSuffix(year, lang)}`;
    }
    case "century": {
      const n = centuryOf(year);
      if (lang === "de") {
        if (approx) {
          const round = year > 0 ? Math.floor(year / 100) * 100 : year;
          return `um ${yearText(round === 0 ? year : round, lang)}`;
        }
        return `${n}. Jahrhundert${bcSuffix(year, lang)}`;
      }
      return `${c}${ordinalEn(n)} century${bcSuffix(year, lang)}`;
    }
    case "decade": {
      const abs = Math.abs(year);
      return lang === "de"
        ? `${approx ? "um die " : ""}${abs}er Jahre${bcSuffix(year, lang)}`
        : `${c}${abs}s${bcSuffix(year, lang)}`;
    }
    case "month":
      if (month !== null) {
        return `${c}${um}${MONTHS[lang][month - 1]} ${yearText(year, lang)}`;
      }
      return `${c}${um}${yearText(year, lang)}`;
    case "day":
      if (month !== null && day !== null) {
        return lang === "de"
          ? `${um}${day}. ${MONTHS.de[month - 1]} ${yearText(year, lang)}`
          : `${c}${day} ${MONTHS.en[month - 1]} ${yearText(year, lang)}`;
      }
      return formatDatePart(date, month !== null ? "month" : "year", lang, approx);
    default:
      if (Math.abs(year) >= 100_000) return yearsAgo(year, approx, lang);
      return `${c}${um}${yearText(year, lang)}`;
  }
}

/** The precision an interval's end is printed at (a bare year never shows a day). */
function precisionOfDate(date: TimelineDate, fallback: TimelinePrecision): TimelinePrecision {
  if (date.day !== null) return "day";
  if (date.month !== null) return "month";
  return fallback === "day" || fallback === "month" ? "year" : fallback;
}

export interface FormatOptions {
  /** Intervals at full precision ("6 July 1898 – 6 September 1962"). Default: years only. */
  full?: boolean;
}

/**
 * The event's date as a reader sees it: "26 August 1841", „26. August
 * 1841“, "44 BC", "c. 13th century", „um 1200“, "66 million years ago",
 * „vor 66 Millionen Jahren“, "1898 – 1962", "since 1954", "born 1954".
 */
export function formatTimelineDate(
  ev: Pick<TimelineEvent, "kind" | "start" | "end" | "precision" | "approx" | "ongoing">,
  lang: TimelineLang,
  opts: FormatOptions = {},
): string {
  const start = parseTimelineDate(ev.start);
  if (!start) return ev.start;
  const end = ev.end === null ? null : parseTimelineDate(ev.end);
  const coarse = (p: TimelinePrecision): TimelinePrecision =>
    opts.full || (p !== "day" && p !== "month") ? p : "year";

  if (!end) {
    if (ev.ongoing) {
      const from = formatDatePart(start, coarse(ev.precision), lang, ev.approx);
      if (ev.kind === "lifespan") return lang === "de" ? `geboren ${from}` : `born ${from}`;
      return lang === "de" ? `seit ${from}` : `since ${from}`;
    }
    return formatDatePart(start, ev.precision, lang, ev.approx);
  }

  const endPrecision = precisionOfDate(end, ev.precision);
  // Deep time: "66 – 23 million years ago" reads worse than two full phrases.
  const sp = coarse(ev.precision);
  const ep = coarse(endPrecision);
  if (sp === "megayear" || ep === "megayear") {
    return `${formatDatePart(start, sp, lang, ev.approx)} – ${formatDatePart(end, ep, lang)}`;
  }
  // Centuries: "15th–16th century" / „15.–16. Jahrhundert“. An end year
  // closes its century ("1600" ends the 16th), a start year opens one.
  if (sp === "century" && ep === "century" && start.year < 0 === end.year < 0) {
    const from = centuryOf(start.year);
    const to = Math.ceil(Math.abs(end.year) / 100);
    if (to !== from) {
      const bc = bcSuffix(start.year, lang);
      return lang === "de"
        ? `${ev.approx ? "ca. " : ""}${from}.–${to}. Jahrhundert${bc}`
        : `${ev.approx ? "c. " : ""}${ordinalEn(from)}–${ordinalEn(to)} century${bc}`;
    }
  }
  // Both BC: the era marker once, at the end ("100 – 44 BC").
  const sameEra = start.year < 0 && end.year < 0;
  let from = formatDatePart(start, sp, lang, ev.approx);
  if (sameEra) from = from.replace(lang === "de" ? / v\. Chr\.$/ : / BC$/, "");
  // Both AD under 500: "AD 14 – 37" rather than "AD 14 – AD 37".
  if (start.year > 0 && start.year < 500 && end.year > 0 && end.year < 500 && sp === "year") {
    const to = formatDatePart(end, ep, lang);
    return lang === "de"
      ? `${from.replace(/ n\. Chr\.$/, "")} – ${to}`
      : `${from} – ${to.replace(/^AD /, "")}`;
  }
  return `${from} – ${formatDatePart(end, ep, lang)}`;
}

// ── Eras ───────────────────────────────────────────────────────────────

export type EraId =
  | "deep-time"
  | "antiquity"
  | "middle-ages"
  | "early-modern"
  | "c19"
  | "c20"
  | "c21";

export interface Era {
  id: EraId;
  en: string;
  de: string;
  /** Short caption for chips and the jump rail. */
  shortEn: string;
  shortDe: string;
  /** Sort-key range [from, to). */
  from: number;
  to: number;
  /** Share of the display axis (before any per-event stretching). */
  weight: number;
}

/** The oldest thing a question can be about. */
export const DEEP_TIME_FLOOR = -13_800_000_000;
/** "Now" for years-before-present arithmetic (deep time does not care which year). */
const PRESENT = 2000;
/** A little headroom past today for ongoing spans. */
export const TIMELINE_CEILING = 2100;

export const ERAS: readonly Era[] = [
  {
    id: "deep-time",
    en: "Deep time",
    de: "Tiefenzeit",
    shortEn: "Deep time",
    shortDe: "Tiefenzeit",
    from: DEEP_TIME_FLOOR,
    to: -3000,
    weight: 1.2,
  },
  {
    id: "antiquity",
    en: "Antiquity",
    de: "Antike",
    shortEn: "Antiquity",
    shortDe: "Antike",
    from: -3000,
    to: 476,
    weight: 1.4,
  },
  {
    id: "middle-ages",
    en: "Middle Ages",
    de: "Mittelalter",
    shortEn: "Middle Ages",
    shortDe: "Mittelalter",
    from: 476,
    to: 1500,
    weight: 1.1,
  },
  {
    id: "early-modern",
    en: "Early modern",
    de: "Frühe Neuzeit",
    shortEn: "Early modern",
    shortDe: "Fr. Neuzeit",
    from: 1500,
    to: 1800,
    weight: 1.3,
  },
  {
    id: "c19",
    en: "19th century",
    de: "19. Jahrhundert",
    shortEn: "19th c.",
    shortDe: "19. Jh.",
    from: 1800,
    to: 1900,
    weight: 1.4,
  },
  {
    id: "c20",
    en: "20th century",
    de: "20. Jahrhundert",
    shortEn: "20th c.",
    shortDe: "20. Jh.",
    from: 1900,
    to: 2000,
    weight: 2,
  },
  {
    id: "c21",
    en: "21st century",
    de: "21. Jahrhundert",
    shortEn: "21st c.",
    shortDe: "21. Jh.",
    from: 2000,
    to: TIMELINE_CEILING,
    weight: 0.9,
  },
];

export function eraIndexOf(key: number): number {
  for (let i = ERAS.length - 1; i >= 0; i--) if (key >= ERAS[i].from) return i;
  return 0;
}

export function eraOf(key: number): Era {
  return ERAS[eraIndexOf(key)];
}

// ── Display scale ──────────────────────────────────────────────────────

const TOTAL_WEIGHT = ERAS.reduce((a, e) => a + e.weight, 0);
const ERA_OFFSETS: readonly number[] = ERAS.reduce<number[]>((acc, _era, i) => {
  acc.push(i === 0 ? 0 : acc[i - 1] + ERAS[i - 1].weight / TOTAL_WEIGHT);
  return acc;
}, []);

/**
 * Sort key → [0, 1] down the river. Each era owns a fixed share of the axis;
 * inside deep time the position is logarithmic in years-before-present (the
 * Big Bang and the dinosaurs both fit), everywhere else linear, so recent
 * centuries get far more room per year than antiquity. Monotonic.
 */
export function timelineScale(key: number): number {
  const k = Math.min(Math.max(key, DEEP_TIME_FLOOR), TIMELINE_CEILING);
  const i = eraIndexOf(k);
  const era = ERAS[i];
  let t: number;
  if (era.id === "deep-time") {
    // Years before the present, on a log axis: 0 at the floor, 1 at −3000.
    const top = Math.log10(PRESENT - era.from);
    const bottom = Math.log10(PRESENT - era.to);
    t = (top - Math.log10(PRESENT - k)) / (top - bottom);
  } else {
    t = (k - era.from) / (era.to - era.from);
  }
  return ERA_OFFSETS[i] + (Math.min(Math.max(t, 0), 1) * era.weight) / TOTAL_WEIGHT;
}

/** Where each era starts on the [0, 1] axis. */
export function eraOffsets(): readonly number[] {
  return ERA_OFFSETS;
}

// ── Collections ────────────────────────────────────────────────────────

/** Years between the earliest start and the latest end of a set of events. */
export function timelineSpanYears(events: Iterable<ParsedEvent>): number {
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const p of events) {
    lo = Math.min(lo, p.startKey);
    hi = Math.max(hi, p.endKey);
  }
  return Number.isFinite(lo) ? Math.max(0, hi - lo) : 0;
}

/** "3,000 years", "66 million years" — the hub's teaser phrase. */
export function formatSpan(years: number, lang: TimelineLang): string {
  if (years < 1) return lang === "de" ? "weniger als ein Jahr" : "less than a year";
  if (years >= 1e9) {
    const v = Number((years / 1e9).toPrecision(2));
    const n = lang === "de" ? String(v).replace(".", ",") : String(v);
    return lang === "de" ? `${n} Milliarden Jahre` : `${n} billion years`;
  }
  if (years >= 1e6) {
    const v = Number((years / 1e6).toPrecision(2));
    const n = lang === "de" ? String(v).replace(".", ",") : String(v);
    return lang === "de" ? `${n} Millionen Jahre` : `${n} million years`;
  }
  const rounded =
    years >= 1000
      ? Math.round(years / 100) * 100
      : years >= 100
        ? Math.round(years / 10) * 10
        : Math.round(years);
  const n = groupDigits(rounded, lang);
  if (lang === "de") return `${n} ${rounded === 1 ? "Jahr" : "Jahre"}`;
  return `${n} ${rounded === 1 ? "year" : "years"}`;
}
