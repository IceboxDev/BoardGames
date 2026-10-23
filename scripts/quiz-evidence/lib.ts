// The evidence crawler's pure parts: page text extraction, answer matching,
// clone detection and the append-only assessment planner. No I/O here, so
// everything is unit-tested in lib.test.ts; cli.ts / net.ts / store.ts do
// the fetching and the writing.

import type {
  ArticleEvidence,
  Assessment,
  EvidenceSource,
  SourceKind,
} from "../../packages/core/src/quiz/evidence-types.ts";
import {
  CLONE_DOMAINS,
  domainFamily,
  factGrade,
  registrableDomain,
  sourceFamily,
} from "../../packages/core/src/quiz/grade.ts";

/** Who the crawler's assessments are by. */
export const CRAWLER = "crawler";
/** Note prefixes that tell the crawler's two kinds of assessment apart. */
export const ANSWER_CHECK = "answer check";
export const QUOTE_CHECK = "quote check";
/** The longest quote the crawler stores. */
export const MAX_QUOTE = 300;

// ── Text extraction ──────────────────────────────────────────────────────

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  laquo: "«",
  raquo: "»",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  bdquo: "„",
  sbquo: "‚",
  shy: "\u00ad",
  thinsp: "\u2009",
  ensp: "\u2002",
  emsp: "\u2003",
  middot: "·",
  bull: "•",
  deg: "°",
  copy: "©",
  reg: "®",
  trade: "™",
  times: "×",
  minus: "−",
  euro: "€",
  pound: "£",
  sect: "§",
  para: "¶",
  frac12: "½",
  frac14: "¼",
  frac34: "¾",
  auml: "ä",
  ouml: "ö",
  uuml: "ü",
  Auml: "Ä",
  Ouml: "Ö",
  Uuml: "Ü",
  szlig: "ß",
  eacute: "é",
  egrave: "è",
  aacute: "á",
  agrave: "à",
  iacute: "í",
  oacute: "ó",
  uacute: "ú",
  ccedil: "ç",
  ntilde: "ñ",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X"
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return NAMED_ENTITIES[body] ?? m;
  });
}

/** Elements whose whole content is never page text. */
const DROP_ELEMENTS = [
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "math",
  "iframe",
  "object",
  "canvas",
  "nav",
  "header",
  "footer",
  "aside",
  "form",
  "button",
  "select",
];
const BLOCK_TAGS =
  /<\/?(?:p|div|br|hr|li|ul|ol|dl|dt|dd|h[1-6]|tr|table|thead|tbody|section|article|main|blockquote|pre|figure|figcaption|caption|address|details|summary)\b[^>]*>/gi;

/** The inner HTML of the first `<tag …>…</tag>`, or null. */
function innerOf(html: string, tag: string): string | null {
  const open = new RegExp(`<${tag}\\b[^>]*>`, "i").exec(html);
  if (!open) return null;
  const close = html.toLowerCase().lastIndexOf(`</${tag}>`);
  if (close <= open.index) return null;
  return html.slice(open.index + open[0].length, close);
}

/**
 * Readable text of an HTML page: scripts, styles, navigation, headers,
 * footers, asides and forms dropped; `<article>` (else `<main>`, else
 * `<body>`) kept; blocks become lines; entities decoded; whitespace
 * collapsed within lines and empty lines removed.
 */
export function extractText(html: string): string {
  let h = html.replace(/<!--[\s\S]*?-->/g, " ");
  h = h.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, " ");
  for (const tag of DROP_ELEMENTS) {
    h = h.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}\\s*>`, "gi"), " ");
    h = h.replace(new RegExp(`<${tag}\\b[^>]*/>`, "gi"), " ");
  }
  const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(h)?.[1];
  const body = innerOf(h, "article") ?? innerOf(h, "main") ?? innerOf(h, "body") ?? h;
  let t = body
    .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, " ")
    .replace(BLOCK_TAGS, "\n")
    .replace(/<(?:td|th)\b[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, "");
  t = decodeEntities(t);
  const lines = t
    .split(/\r?\n/)
    .map((l) => l.replace(/[\s\u00a0]+/g, " ").trim())
    .filter((l) => l.length > 0);
  const head = title ? decodeEntities(title).replace(/\s+/g, " ").trim() : "";
  if (head && lines[0] !== head) lines.unshift(head);
  return lines.join("\n");
}

// ── Normalisation & answer matching ──────────────────────────────────────

/** Characters that are only joiners / invisible: removed outright. */
const INVISIBLE = /\u00ad|\u200b|\u200c|\u200d|\u2060|\ufeff/;
/** Hyphens, dashes, underscores and whitespace: one separator. */
const SEPARATOR = /[\s\-_\u2010-\u2015\u2212\u2e3a\u2e3b\u30fc]/u;
const SINGLE_QUOTES = /[\u2018\u2019\u201a\u201b\u2032\u02bc\u0060\u00b4]/;
const DOUBLE_QUOTES = /[\u201c\u201d\u201e\u201f\u00ab\u00bb\u2033\u2039\u203a]/;
/**
 * A thousands separator: a `,` `.` `'` or space between a group of 1–3
 * digits (itself after a non-digit or another such group) and exactly three
 * digits. "1,000", "1.000", "1 000" and "1000" all normalise to "1000";
 * "1945 200" stays apart.
 */
const THOUSANDS = /(?<=(?:^|\D)\d{1,3}(?:[,.' ]\d{3})*)[,.' ](?=\d{3}(?!\d))/g;

export interface Normalized {
  /** Case-folded, diacritics-folded, separators collapsed. */
  norm: string;
  /** `map[i]` = index in the original string of `norm[i]`. */
  map: number[];
}

/**
 * Fold a string for matching while remembering where each character came
 * from: NFKD with combining marks dropped (é → e, й → и), lower case,
 * ß → ss, every run of whitespace / hyphens / dashes → one space,
 * typographic quotes → ASCII, thousands separators dropped.
 */
export function normalizeWithMap(s: string): Normalized {
  const chars: string[] = [];
  const map: number[] = [];
  let i = 0;
  for (const ch of s) {
    const at = i;
    i += ch.length;
    if (INVISIBLE.test(ch)) continue;
    if (SEPARATOR.test(ch)) {
      if (chars.length > 0 && chars[chars.length - 1] !== " ") {
        chars.push(" ");
        map.push(at);
      }
      continue;
    }
    if (SINGLE_QUOTES.test(ch)) {
      chars.push("'");
      map.push(at);
      continue;
    }
    if (DOUBLE_QUOTES.test(ch)) {
      chars.push('"');
      map.push(at);
      continue;
    }
    const folded = ch.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/ß/g, "ss");
    for (const c of folded) {
      if (SEPARATOR.test(c)) {
        if (chars.length > 0 && chars[chars.length - 1] !== " ") {
          chars.push(" ");
          map.push(at);
        }
        continue;
      }
      chars.push(c);
      map.push(at);
    }
  }
  while (chars.length > 0 && chars[chars.length - 1] === " ") {
    chars.pop();
    map.pop();
  }
  // Thousands separators, located on the folded string.
  const joined = chars.join("");
  const drop = new Set<number>();
  for (const m of joined.matchAll(THOUSANDS)) drop.add(m.index);
  if (drop.size === 0) return { norm: joined, map };
  const outC: string[] = [];
  const outM: number[] = [];
  for (let k = 0; k < chars.length; k++) {
    if (drop.has(k)) continue;
    outC.push(chars[k]);
    outM.push(map[k]);
  }
  return { norm: outC.join(""), map: outM };
}

export const normalize = (s: string): string => normalizeWithMap(s).norm;

const WORD_CHAR = /[\p{L}\p{N}]/u;
/** How many occurrences findAnswer looks through for one in a real sentence. */
const MAX_OCCURRENCES = 50;
/** A quote this much longer than the matched answer counts as a sentence, not a heading. */
const INFORMATIVE_EXTRA = 25;

export interface AnswerMatch {
  /** Start / end of the matched answer in the original text. */
  start: number;
  end: number;
  /** The sentence around it, verbatim from the text, ≤ MAX_QUOTE characters. */
  quote: string;
  /** The answer variant that matched. */
  answer: string;
}

/** The forms of an answer that are searched for (the folded answer, and without quote marks). */
export function answerForms(answer: string): string[] {
  const n = normalize(answer.trim());
  const forms = [n, n.replace(/"/g, "").replace(/\s+/g, " ").trim()];
  return [...new Set(forms)].filter((f) => f.length > 0);
}

/**
 * Where `answer` occurs in `text` as whole words, after folding both (case,
 * diacritics, hyphen / space, number formats, quote marks): the first
 * occurrence inside a sentence, else the first at all. Null when absent.
 */
export function findAnswer(
  text: string,
  answer: string,
  folded: Normalized = normalizeWithMap(text),
): AnswerMatch | null {
  const { norm, map } = folded;
  for (const form of answerForms(answer)) {
    let from = 0;
    let first: AnswerMatch | null = null;
    for (let seen = 0; seen < MAX_OCCURRENCES; ) {
      const k = norm.indexOf(form, from);
      if (k < 0) break;
      from = k + 1;
      const before = k > 0 ? norm[k - 1] : "";
      const after = norm[k + form.length] ?? "";
      const edgeL = WORD_CHAR.test(form[0]) && before !== "" && WORD_CHAR.test(before);
      const edgeR = WORD_CHAR.test(form[form.length - 1]) && after !== "" && WORD_CHAR.test(after);
      if (edgeL || edgeR) continue;
      const start = map[k];
      const lastIdx = map[k + form.length - 1];
      const end = lastIdx + ((text.codePointAt(lastIdx) ?? 0) > 0xffff ? 2 : 1);
      const m = { start, end, quote: sentenceAround(text, start, end), answer };
      // A bare heading ("Hanns Eisler" as the page title) proves less than a
      // sentence: prefer the first occurrence that sits in real prose.
      if (m.quote.length >= end - start + INFORMATIVE_EXTRA) return m;
      first ??= m;
      seen++;
    }
    if (first) return first;
  }
  return null;
}

/**
 * The sentence holding `[start, end)`: from after the previous sentence end
 * (`.` `!` `?` `…` followed by a space) or line break, to the next one.
 * Longer than `max` → a window around the match cut at word boundaries. Always
 * a verbatim substring of `text` (trimmed, no ellipsis added).
 */
export function sentenceAround(text: string, start: number, end: number, max = MAX_QUOTE): string {
  let s = start;
  while (s > 0) {
    const c = text[s - 1];
    if (c === "\n") break;
    if (/\s/.test(c) && s >= 2 && /[.!?…]/.test(text[s - 2])) break;
    s--;
  }
  let e = end;
  while (e < text.length) {
    const c = text[e];
    if (c === "\n") break;
    if (/[.!?…]/.test(c) && (e + 1 >= text.length || /\s/.test(text[e + 1]))) {
      e++;
      break;
    }
    e++;
  }
  if (e - s <= max) return text.slice(s, e).trim();
  if (end - start >= max) return text.slice(start, start + max).trim();
  const room = max - (end - start);
  let left = Math.min(start - s, Math.floor(room / 2));
  const right = Math.min(e - end, room - left);
  left = Math.min(start - s, room - right);
  let ws = start - left;
  let we = end + right;
  // Snap to word boundaries, never cutting into the match.
  if (ws > s) {
    const sp = text.indexOf(" ", ws);
    if (sp >= 0 && sp < start) ws = sp + 1;
  }
  if (we < e) {
    const sp = text.lastIndexOf(" ", we);
    if (sp >= end) we = sp;
  }
  return text.slice(ws, we).trim();
}

/** Light normalisation for comparing a stored quote with the page: whitespace and typography only. */
export function normalizeQuote(s: string): string {
  return s
    .normalize("NFC")
    .replace(/\u00ad|\u200b|\u200c|\u200d|\u2060|\ufeff/g, "")
    .replace(/[‘’‚‛ʼ]/g, "'")
    .replace(/[“”„‟«»]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** Does `quote` occur in `text` (whitespace and typographic quotes / dashes normalised)? */
export function quoteOccurs(text: string, quote: string): boolean {
  const q = normalizeQuote(quote);
  return q.length > 0 && normalizeQuote(text).includes(q);
}

interface FactAnswers {
  answerEn: string;
  answerDe: string;
  answerRu?: string;
}

/** The answers to look for on a page in `lang`: its own language's first, then the others. */
export function answerCandidates(
  fact: FactAnswers,
  lang: string,
): { text: string; lang: string }[] {
  const all = [
    { text: fact.answerEn, lang: "en" },
    { text: fact.answerDe, lang: "de" },
    ...(fact.answerRu ? [{ text: fact.answerRu, lang: "ru" }] : []),
  ];
  const own = all.find((a) => a.lang === lang) ?? all[0];
  const out = [own];
  for (const a of all) if (!out.some((o) => o.text === a.text)) out.push(a);
  return out;
}

// ── Wikipedia & HTTP helpers ─────────────────────────────────────────────

/** `https://de.m.wikipedia.org/wiki/Kinderhymne#x` → `{lang: "de", title: "Kinderhymne"}`. */
export function parseWikipediaUrl(url: string): { lang: string; title: string } | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const m = /^([a-z][a-z0-9-]*)\.(?:m\.)?wikipedia\.org$/.exec(u.hostname.toLowerCase());
  if (!m || m[1] === "www" || m[1] === "commons") return null;
  let raw: string | null = null;
  if (u.pathname.startsWith("/wiki/")) raw = u.pathname.slice(6);
  else if (u.pathname === "/w/index.php") raw = u.searchParams.get("title");
  if (!raw) return null;
  let title: string;
  try {
    title = decodeURIComponent(raw);
  } catch {
    title = raw;
  }
  title = title.replace(/_/g, " ").trim();
  return title ? { lang: m[1], title } : null;
}

/** The plain-text extract API call for one Wikipedia page (redirects followed). */
export function wikipediaExtractUrl(lang: string, title: string): string {
  const q = new URLSearchParams({
    action: "query",
    prop: "extracts",
    explaintext: "1",
    exsectionformat: "plain",
    redirects: "1",
    titles: title,
    format: "json",
    formatversion: "2",
  });
  return `https://${lang}.wikipedia.org/w/api.php?${q}`;
}

export function wikipediaPageUrl(lang: string, title: string): string {
  return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_")).replace(/%2F/g, "/")}`;
}

/** A `Retry-After` header → milliseconds (seconds or an HTTP date), null when absent / bad. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const v = value.trim();
  if (/^\d+$/.test(v)) return Number(v) * 1000;
  const t = Date.parse(v);
  return Number.isFinite(t) ? Math.max(0, t - now) : null;
}

/** A URL compared loosely: no fragment, no trailing slash, http = https, host lower case. */
export function urlKey(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.hostname.toLowerCase()}${path}${u.search}`;
  } catch {
    return url;
  }
}

// ── Clone detection ──────────────────────────────────────────────────────

export const SHINGLE_WORDS = 8;
export const CLONE_JACCARD = 0.6;
/** Pages with fewer shingles than this are never compared (error pages, stubs). */
export const MIN_SHINGLES = 50;

/** 32-bit FNV-1a. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The text's `n`-word shingles (folded words), hashed. */
export function shingles(text: string, n = SHINGLE_WORDS): Set<number> {
  const words = normalize(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 0);
  const out = new Set<number>();
  for (let i = 0; i + n <= words.length; i++) out.add(fnv1a(words.slice(i, i + n).join(" ")));
  return out;
}

export function jaccard(a: ReadonlySet<number>, b: ReadonlySet<number>): number {
  if (a.size === 0 && b.size === 0) return 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  let inter = 0;
  for (const x of small) if (big.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

const KIND_RANK: Readonly<Record<SourceKind, number>> = {
  primary: 0,
  official: 1,
  scholarly: 2,
  reference: 3,
  encyclopedia: 4,
  book: 5,
  press: 6,
  fan: 7,
  other: 8,
};
const sourceNum = (id: string) => Number(id.slice(1));

/** Sources most authoritative first: by kind, then the earlier id. */
export function byAuthority(sources: Readonly<Record<string, EvidenceSource>>): string[] {
  return Object.keys(sources).sort(
    (x, y) =>
      KIND_RANK[sources[x].kind] - KIND_RANK[sources[y].kind] || sourceNum(x) - sourceNum(y),
  );
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Would `from.cloneOf = to` close a loop (does `to`'s chain reach `from`)? */
function reaches(
  to: string,
  from: string,
  sources: Readonly<Record<string, EvidenceSource>>,
  extra: Readonly<Record<string, string>>,
): boolean {
  const seen = new Set<string>();
  let cur: string | undefined = to;
  while (cur && !seen.has(cur)) {
    if (cur === from) return true;
    seen.add(cur);
    const next: string | undefined = extra[cur] ?? sources[cur]?.cloneOf;
    cur = next && /^s\d+$/.test(next) ? next : undefined;
  }
  return false;
}

/**
 * New `cloneOf` marks for a ledger's sources (only sources without one):
 * a host on the mirror list → the site it copies; a page whose text shares
 * ≥ CLONE_JACCARD of its 8-word shingles with a more authoritative source of
 * ANOTHER domain family → that source.
 */
export function detectClones(
  sources: Readonly<Record<string, EvidenceSource>>,
  texts: ReadonlyMap<string, string>,
  cloneDomains: Readonly<Record<string, string>> = CLONE_DOMAINS,
): Record<string, string> {
  const marks: Record<string, string> = {};
  for (const [id, s] of Object.entries(sources)) {
    if (s.cloneOf) continue;
    const host = hostOf(s.url);
    if (!host) continue;
    for (const [mirror, of] of Object.entries(cloneDomains)) {
      if (host !== mirror && !host.endsWith(`.${mirror}`)) continue;
      if (registrableDomain(host) !== registrableDomain(of)) marks[id] = registrableDomain(of);
      break;
    }
  }
  const order = byAuthority(sources).filter((id) => texts.has(id));
  const sh = new Map<string, Set<number>>();
  for (const id of order) {
    const set = shingles(texts.get(id) ?? "");
    if (set.size >= MIN_SHINGLES) sh.set(id, set);
  }
  const fam = (id: string) => {
    const mark = marks[id];
    if (mark && !/^s\d+$/.test(mark)) return domainFamily(mark, cloneDomains);
    return sourceFamily(id, sources, cloneDomains);
  };
  for (let j = 0; j < order.length; j++) {
    const b = order[j];
    if (sources[b].cloneOf || marks[b] || !sh.has(b)) continue;
    for (let i = 0; i < j; i++) {
      const a = order[i];
      if (!sh.has(a) || fam(a) === fam(b)) continue;
      if (reaches(a, b, sources, marks)) continue;
      if (jaccard(sh.get(a) as Set<number>, sh.get(b) as Set<number>) >= CLONE_JACCARD) {
        marks[b] = a;
        break;
      }
    }
  }
  return marks;
}

// ── Assessments ──────────────────────────────────────────────────────────

/** An assessment before it gets its id and date. */
export type AssessmentDraft = Omit<Assessment, "id" | "at">;

interface FactLike extends FactAnswers {
  id: string;
  source?: { url: string };
}

const isAnswerCheck = (a: { by: string; note?: string }) =>
  a.by === CRAWLER && (a.note ?? "").startsWith(ANSWER_CHECK);

/** The ledger sources that speak to a fact: cited by any of its assessments, or its own source URL. */
export function factSourceIds(evidence: ArticleEvidence, fact: FactLike): string[] {
  const ids = new Set<string>();
  for (const a of evidence.assessments) {
    if (a.target !== fact.id) continue;
    for (const s of a.support) ids.add(s.source);
  }
  if (fact.source) {
    const key = urlKey(fact.source.url);
    for (const [id, s] of Object.entries(evidence.sources)) if (urlKey(s.url) === key) ids.add(id);
  }
  return [...ids].filter((id) => evidence.sources[id]).sort((x, y) => sourceNum(x) - sourceNum(y));
}

/** Latest (file order = time order) assessment matching `pred`. */
function latest(list: readonly AssessmentDraft[], pred: (a: AssessmentDraft) => boolean) {
  for (let i = list.length - 1; i >= 0; i--) if (pred(list[i])) return list[i];
  return undefined;
}

export interface PlanOptions {
  /** Timestamp for `verifiedAt` on new quotes. */
  now: string;
  run?: string;
}

/**
 * The crawler assessments a ledger is missing, given the text of every
 * snapshotted source. Two kinds, never repeating what the crawler already
 * said (re-runs append nothing):
 *
 * - **quote check** — an agent's quote (no `verifiedAt`) in a decisive
 *   assessment (not `unverified`) found on its
 *   source's snapshot is re-stated with `verifiedAt`, same verdict and
 *   confidence. Only the latest assessment for that target / claim / source
 *   is checked, so an older judgement is never revived.
 * - **answer check** — per active fact and each of its snapshotted sources:
 *   `confirmed` with the matched sentence when the answer is on the page,
 *   else `unverified`. Appended only when it differs from the crawler's
 *   last answer check there, never against a person's or agent's decisive
 *   judgement it disagrees with, and never on a contested fact.
 */
export function planAssessments(
  evidence: ArticleEvidence,
  facts: readonly FactLike[],
  texts: ReadonlyMap<string, string>,
  opts: PlanOptions,
): AssessmentDraft[] {
  const out: AssessmentDraft[] = [];
  const history = (): AssessmentDraft[] => [...evidence.assessments, ...out];
  const base = { by: CRAWLER, ...(opts.run ? { run: opts.run } : {}) };
  const factIds = new Set(facts.map((f) => f.id));

  // Quote checks.
  for (const a of evidence.assessments) {
    if (a.by === CRAWLER || a.verdict === "unverified") continue;
    if (!a.target.includes(":") && !factIds.has(a.target)) continue;
    for (const sup of a.support) {
      if (sup.verifiedAt) continue;
      const text = texts.get(sup.source);
      if (text === undefined) continue;
      const last = latest(
        history(),
        (x) =>
          x.target === a.target &&
          x.claim === a.claim &&
          x.by !== CRAWLER &&
          x.support.some((s) => s.source === sup.source),
      );
      if (last !== a) continue;
      const done = history().some(
        (x) =>
          x.by === CRAWLER &&
          x.target === a.target &&
          x.claim === a.claim &&
          x.support.some((s) => s.source === sup.source && s.quote === sup.quote && s.verifiedAt),
      );
      if (done || !quoteOccurs(text, sup.quote)) continue;
      out.push({
        target: a.target,
        claim: a.claim,
        verdict: a.verdict,
        confidence: a.confidence,
        support: [{ ...sup, verifiedAt: opts.now }],
        ...base,
        note: `${QUOTE_CHECK}: the quote of ${a.id} is on the snapshot of ${sup.source}`,
      });
    }
  }

  // Answer checks.
  for (const fact of facts) {
    if (
      factGrade(fact.id, { ...evidence, assessments: assignIds(evidence, out, opts.now) }).contested
    )
      continue;
    for (const sid of factSourceIds(evidence, fact)) {
      const text = texts.get(sid);
      if (text === undefined) continue;
      const src = evidence.sources[sid];
      const folded = normalizeWithMap(text);
      const cands = answerCandidates(fact, src.lang);
      let match: AnswerMatch | null = null;
      for (const c of cands) {
        match = findAnswer(text, c.text, folded);
        if (match) break;
      }
      const verdict = match ? "confirmed" : "unverified";
      const quote = match ? match.quote : cands[0].text;
      const onSource = (x: AssessmentDraft) =>
        x.target === fact.id && x.claim === "answer" && x.support.some((s) => s.source === sid);
      // A person's or agent's decisive judgement (or the crawler re-stating
      // one) stands against a machine check that disagrees with it.
      const judged = latest(history(), (x) => onSource(x) && !isAnswerCheck(x));
      if (judged && judged.verdict !== "unverified" && judged.verdict !== verdict) continue;
      const lastCheck = latest(history(), (x) => onSource(x) && isAnswerCheck(x));
      if (
        lastCheck &&
        lastCheck.verdict === verdict &&
        lastCheck.support.some((s) => s.source === sid && s.quote === quote)
      )
        continue;
      out.push({
        target: fact.id,
        claim: "answer",
        verdict,
        confidence: "medium",
        support: [
          match
            ? { source: sid, quote, quoteLang: src.lang, verbatim: true, verifiedAt: opts.now }
            : { source: sid, quote, quoteLang: cands[0].lang, verbatim: false },
        ],
        ...base,
        note: match
          ? `${ANSWER_CHECK}: “${match.answer}” is on the snapshot of ${sid}`
          : `${ANSWER_CHECK}: no answer (${cands.map((c) => `“${c.text}”`).join(", ")}) on the snapshot of ${sid}`,
      });
    }
  }
  return out;
}

/** The ledger's assessments plus drafts given ids `e<max+1>…` and a date no earlier than the last. */
export function assignIds(
  evidence: ArticleEvidence,
  drafts: readonly AssessmentDraft[],
  now: string,
): Assessment[] {
  let max = 0;
  let lastAt = "";
  for (const a of evidence.assessments) {
    max = Math.max(max, Number(a.id.slice(1)));
    if (a.at > lastAt) lastAt = a.at;
  }
  const at = now >= lastAt ? now : lastAt;
  return [...evidence.assessments, ...drafts.map((d, i) => ({ id: `e${max + 1 + i}`, at, ...d }))];
}

/** The ledger with the drafts appended (a new object; existing assessments untouched). */
export function appendAssessments(
  evidence: ArticleEvidence,
  drafts: readonly AssessmentDraft[],
  now: string,
): ArticleEvidence {
  if (drafts.length === 0) return evidence;
  return { ...evidence, assessments: assignIds(evidence, drafts, now) };
}
