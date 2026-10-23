// Evidence backfill: seeds `content/evidence/aNNNN.json` for every article
// from what the bank already cites — see README.md ("Backfill").
//
//   pnpm quiz-evidence backfill [--articles=a0001,a0002] [--dry-run] [--content-dir=<dir>]
//
// Sources, per article, deduplicated by normalised URL:
//   - each active fact's `source`;
//   - every URL in a history entry's `sources`, credited to the fact the entry
//     targets (a wording's entry → its fact; article-level entries add the
//     source without crediting a fact);
//   - the transcript source of each printed wording
//     (`quiz-archive/transcripts/<source>/<card>.json`);
//   - the hand check's sources (`quiz-archive/runs/handcheck-2026-10-23`).
// Assessments: one `unverified` seed per (fact, source), whose support quote
// is the fact's answer in the source's language (`verbatim: false`) — the
// crawler's own format for an answer it has not found yet, and what links the
// source to the fact for its answer checks. Hand-check verdicts become real
// assessments. Append-only and idempotent: a re-run adds only what is missing,
// with ids continuing the file's own.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type Article,
  ArticleSchema,
  type Fact,
  type RetiredFact,
} from "../../packages/core/src/quiz/content-types.ts";
import {
  type ArticleEvidence,
  ArticleEvidenceSchema,
  type Assessment,
  type EvidenceSource,
  evidenceProblems,
  type SourceKind,
} from "../../packages/core/src/quiz/evidence-types.ts";
import type { Confidence } from "../../packages/core/src/quiz/history-schema.ts";
import { atomicWrite, DEFAULT_CONTENT_DIR, REPO, toJson } from "./store.ts";

export const BACKFILL_BY = "backfill";
export const BACKFILL_RUN = "evidence-backfill-2026-10-23";
export const HANDCHECK_BY = "handcheck-research";
export const HANDCHECK_RUN = "handcheck-2026-10-23";
export const BACKFILL_DAY = "2026-10-23";

// ── URLs ─────────────────────────────────────────────────────────────────

const TRACKING = /^(?:utm_[a-z]+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|_ga|_gl|yclid|ref_src|spm)$/i;

/**
 * A cited URL in its stored form: https, no fragment, no tracking params,
 * host lower case, percent-encoding as WHATWG URL prints it. A path with an
 * unclosed `(` (history entries cut at the `)` of a Wikipedia title such as
 * `Ben-Hur_(1959_film`) gets its `)` back. Null when it isn't a URL.
 */
export function normalizeUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  u.protocol = "https:";
  u.hash = "";
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
  const path = decodeURIComponentSafe(u.pathname);
  const open = (path.match(/\(/g) ?? []).length;
  const close = (path.match(/\)/g) ?? []).length;
  if (open === close + 1 && !u.search && /\([^)]*$/.test(path)) u.pathname = `${u.pathname})`;
  return u.href;
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

const hostOf = (url: string): string => new URL(url).hostname.toLowerCase();
const onHost = (host: string, ...domains: string[]) =>
  domains.some((d) => host === d || host.endsWith(`.${d}`));

const PRESS = [
  "bbc.co.uk", "bbc.com", "cnn.com", "nytimes.com", "theguardian.com", "washingtonpost.com",
  "wsj.com", "reuters.com", "apnews.com", "npr.org", "foxnews.com", "cbsnews.com", "abcnews.com",
  "abcnews.go.com", "nbcnews.com", "time.com", "upi.com", "voanews.com", "cbc.ca", "sbs.com.au",
  "aljazeera.com", "csmonitor.com", "irishtimes.com", "irishpost.com", "independent.co.uk",
  "telegraph.co.uk", "thetimes.co.uk", "latimes.com", "usatoday.com", "inquirer.com",
  "lawgazette.co.uk", "gulfnews.com", "ynetnews.com", "deccanherald.com", "theweek.in",
  "downtoearth.org.in", "thelocal.se", "connexionfrance.com", "jewishnews.co.uk", "ansa.it",
  "ilpost.it", "elespanol.com", "nacion.com", "cooperativa.cl", "news.cgtn.com", "abc13.com",
  "wtkr.com", "wbur.org", "ctpublic.org", "christianpost.com", "news.yahoo.com", "yahoo.com",
  "spiegel.de", "zeit.de", "faz.net", "sueddeutsche.de", "welt.de", "tagesschau.de", "taz.de",
  "stern.de", "focus.de", "n-tv.de", "t-online.de", "handelsblatt.com", "freitag.de",
  "berliner-zeitung.de", "berliner-kurier.de", "stuttgarter-zeitung.de", "volksstimme.de",
  "abendzeitung-muenchen.de", "aerztezeitung.de", "bayerische-staatszeitung.de", "computerwoche.de",
  "regensburg-digital.de", "derstandard.at", "diepresse.com", "orf.at", "nzz.ch", "srf.ch",
  "lemonde.fr", "lefigaro.fr", "scientificamerican.com", "sciencedaily.com", "smithsonianmag.com",
  "nationalgeographic.com", "mentalfloss.com", "livescience.com", "space.com", "phys.org",
  "newatlas.com", "gizmodo.com", "futurism.com", "iflscience.com", "sciencefocus.com",
  "snexplores.org", "earth.com", "neurosciencenews.com", "nybooks.com", "nexttv.com",
  "hollywoodreporter.com", "variety.com", "rollingstone.com", "broadwayworld.com", "filmstarts.de",
  "promiflash.de", "hollywoodlife.com", "looper.com", "entrepreneur.com", "globalvoices.org",
  "facingsouth.org", "horizont.net", "netzwelt.de", "moneyland.ch", "curvemag.com", "vegnews.com",
  "flavorwire.com", "timeout.com", "thetakeout.com", "sportbible.com", "foxsports.com.mx",
  "mykhel.com", "thebridge.in", "dailycardinal.com", "villamedia.nl", "veenpers.nl",
];
const SCHOLARLY = [
  "doi.org", "jstor.org", "pubmed.ncbi.nlm.nih.gov", "ncbi.nlm.nih.gov", "europepmc.org",
  "nature.com", "science.org", "sciencemag.org", "arxiv.org", "degruyter.com", "springer.com",
  "link.springer.com", "sciencedirect.com", "wiley.com", "tandfonline.com", "royalsocietypublishing.org",
  "scielo.org.za", "scielo.org", "plos.org", "pnas.org", "academic.oup.com", "cambridge.org",
  "sbp-journal.com", "semanticscholar.org", "researchgate.net", "biodiversitylibrary.org",
];
const REFERENCE = [
  "britannica.com", "brockhaus.de", "encyclopedia.com", "universalis.fr", "plato.stanford.edu",
  "iep.utm.edu", "sf-encyclopedia.com", "etymonline.com", "dwds.de", "duden.de",
  "merriam-webster.com", "dictionary.com", "dictionary.cambridge.org", "oed.com", "linguee.com",
  "redensarten-index.de", "phrases.org.uk", "wordorigins.org", "wiktionary.org", "olympedia.org",
  "worldatlas.com", "mathshistory.st-andrews.ac.uk", "dbnl.org", "ostarrichi.org",
  "germanhistorydocs.org",
];
const ENCYCLOPEDIA = ["wikipedia.org", "wikiquote.org", "wikisource.org", "wikibooks.org",
  "wikidata.org", "wikimedia.org", "wikiwand.com", "de-academic.com"];
const OFFICIAL = [
  "europa.eu", "un.org", "who.int", "fao.org", "undp.org", "wmo.int", "unesco.org", "bipm.org",
  "bund.de", "bundestag.de", "bundesregierung.de", "bundespraesident.de", "gesetze-im-internet.de",
  "bpb.de", "dpma.de", "destatis.de", "bundeswaldinventur.de", "baden-wuerttemberg.de", "dueren.de",
  "admin.ch", "royal.uk", "nobelprize.org", "esa.int", "nasa.gov", "guinnessworldrecords.com",
  "valencia.es", "council.nyc.gov", "blauer-engel.de", "konrad-adenauer.de", "landwirtschaft.de",
];
const BOOK = ["books.google.com", "gutenberg.org", "gutenberg.net.au", "gutenberg.spiegel.de",
  "classics.mit.edu", "biblegateway.com", "die-bibel.de", "simonandschuster.co.uk"];
const FAN = ["fandom.com", "mariowiki.com", "moviemistakes.com", "songfacts.com",
  "the-paulmccartney-project.com", "thesamba.com", "jamesbond007.se", "fernsehserien.de",
  "wunschliste.de", "springfieldspringfield.co.uk", "blogspot.com", "wordpress.com"];

/** A source's kind from its URL (wikipedia → encyclopedia, a .gov → official …). */
export function inferKind(url: string): SourceKind {
  const h = hostOf(url);
  if (onHost(h, ...ENCYCLOPEDIA)) return "encyclopedia";
  if (onHost(h, ...REFERENCE)) return "reference";
  if (onHost(h, ...SCHOLARLY)) return "scholarly";
  if (onHost(h, ...BOOK)) return "book";
  if (onHost(h, ...FAN)) return "fan";
  if (onHost(h, ...OFFICIAL)) return "official";
  if (/\.(?:gov|mil|int)$/.test(h) || /\.(?:gov|gv|govt|gouv|gob|go)\.[a-z]{2}$/.test(h))
    return "official";
  if (/(?:^|\.)museum(?:-digital)?\./.test(h) || /\.museum$/.test(h)) return "official";
  if (onHost(h, ...PRESS)) return "press";
  if (/\.edu$/.test(h) || /\.(?:edu|ac)\.[a-z]{2}$/.test(h)) return "scholarly";
  return "other";
}

/** A page's language when the citation doesn't say: `xx.wikipedia.org` → xx, a .de/.at/.ch host → de, else en. */
export function inferLang(url: string): string {
  const h = hostOf(url);
  const m = /^([a-z]{2})\.(?:m\.)?(?:wikipedia|wiktionary|wikiquote|wikisource|wikibooks)\.org$/.exec(h);
  if (m) return m[1];
  if (/\.(?:de|at|ch|li)$/.test(h)) return "de";
  const tld = /\.(fr|es|it|nl|se|dk|no|fi|pl|cz|ru|pt|jp)$/.exec(h)?.[1];
  const byTld: Record<string, string> = { se: "sv", dk: "da", no: "no", cz: "cs", jp: "ja" };
  if (tld) return byTld[tld] ?? tld;
  return "en";
}

// ── Inputs ───────────────────────────────────────────────────────────────

export interface HistoryEntryLike {
  seq: number;
  at: string;
  target: { type: string; id: string };
  sources?: { url: string; title?: string }[];
}

export interface TranscriptSource {
  url: string;
  title?: string;
  lang?: string;
}

export interface HandcheckVerdict {
  ref: string;
  article: string;
  fact: string;
  wording?: string;
  verdict: "confirmed" | "fixed" | "contested" | "needs-placement";
  confidence: Confidence;
  why: string;
  sources: string[];
  changes: string;
  unit: string;
}

/** `${source}/${card}/${category}` → the transcript's source for that printed question. */
export type TranscriptIndex = ReadonlyMap<string, TranscriptSource>;

export function loadTranscripts(dir: string): Map<string, TranscriptSource> {
  const out = new Map<string, TranscriptSource>();
  if (!existsSync(dir)) return out;
  for (const source of readdirSync(dir).sort()) {
    const sdir = join(dir, source);
    if (!existsSync(sdir) || !source.match(/^[a-z0-9-]+$/)) continue;
    for (const file of readdirSync(sdir).sort()) {
      if (!file.endsWith(".json")) continue;
      const card = file.slice(0, -5);
      const t = JSON.parse(readFileSync(join(sdir, file), "utf8")) as {
        questions?: { category: number; source?: TranscriptSource }[];
        sets?: { n: number; questions: { original?: boolean; source?: TranscriptSource }[] }[];
      };
      for (const q of t.questions ?? [])
        if (q.source?.url) out.set(`${source}/${card}/${q.category}`, q.source);
      for (const s of t.sets ?? []) {
        const q = s.questions.find((x) => x.original) ?? s.questions[0];
        if (q?.source?.url) out.set(`${source}/${card}/${s.n}`, q.source);
      }
    }
  }
  return out;
}

/** The hand check's verdicts, the latest per ref (later units win), with the item's wording. */
export function loadHandcheck(runDir: string): Map<string, HandcheckVerdict[]> {
  const byArticle = new Map<string, HandcheckVerdict[]>();
  const outDir = join(runDir, "out");
  if (!existsSync(outDir)) return byArticle;
  const wordingOf = new Map<string, string>();
  const itemFiles = [
    join(runDir, "items.json"),
    ...readdirSync(outDir)
      .filter((f) => /^u\d+\.items\.json$/.test(f))
      .map((f) => join(outDir, f)),
  ];
  for (const f of itemFiles) {
    if (!existsSync(f)) continue;
    const raw = JSON.parse(readFileSync(f, "utf8")) as
      | { items?: { ref: string; wording?: string }[] }
      | { ref: string; wording?: string }[];
    for (const it of Array.isArray(raw) ? raw : (raw.items ?? []))
      if (it.wording) wordingOf.set(it.ref, it.wording);
  }
  const latest = new Map<string, HandcheckVerdict>();
  const units = readdirSync(outDir)
    .filter((f) => /^u\d+\.verdicts\.json$/.test(f))
    .sort((a, b) => Number(a.slice(1, -14)) - Number(b.slice(1, -14)));
  for (const f of units) {
    const unit = f.slice(0, -14);
    const list = JSON.parse(readFileSync(join(outDir, f), "utf8")) as Omit<
      HandcheckVerdict,
      "unit"
    >[];
    for (const v of list) latest.set(v.ref, { ...v, unit, wording: wordingOf.get(v.ref) });
  }
  for (const v of latest.values()) {
    if (!byArticle.has(v.article)) byArticle.set(v.article, []);
    byArticle.get(v.article)?.push(v);
  }
  return byArticle;
}

// ── The ledger ───────────────────────────────────────────────────────────

type AnyFact = Fact | RetiredFact;

function answerIn(f: AnyFact, lang: string): { quote: string; quoteLang: string } {
  if (lang === "de") return { quote: f.answerDe, quoteLang: "de" };
  if (lang === "ru" && f.answerRu) return { quote: f.answerRu, quoteLang: "ru" };
  return { quote: f.answerEn, quoteLang: "en" };
}

interface Citation {
  url: string;
  title?: string;
  lang?: string;
  at?: string;
  why: string;
}

export interface BackfillInputs {
  history: readonly HistoryEntryLike[];
  transcripts: TranscriptIndex;
  handcheck: readonly HandcheckVerdict[];
  /** `at` for new assessments (raised to the ledger's last `at` when that is later). */
  today?: string;
}

export interface BackfillResult {
  evidence: ArticleEvidence;
  changed: boolean;
  added: { sources: number; seeds: number; handcheck: number };
  skipped: string[];
}

/**
 * The article's ledger with everything the bank cites that `existing` lacks.
 * Pure: same inputs → same output; `existing` is never modified, and its
 * sources and assessments are kept as they are.
 */
export function backfillArticle(
  article: Article,
  existing: ArticleEvidence | null,
  inputs: BackfillInputs,
): BackfillResult {
  const today = inputs.today ?? BACKFILL_DAY;
  const skipped: string[] = [];
  const sources: Record<string, EvidenceSource> = { ...(existing?.sources ?? {}) };
  const assessments: Assessment[] = [...(existing?.assessments ?? [])];
  const byUrl = new Map<string, string>();
  let maxS = 0;
  for (const [id, s] of Object.entries(sources)) {
    const key = normalizeUrl(s.url) ?? s.url;
    if (!byUrl.has(key)) byUrl.set(key, id);
    maxS = Math.max(maxS, Number(id.slice(1)));
  }
  let maxE = 0;
  let lastAt = "";
  for (const a of assessments) {
    maxE = Math.max(maxE, Number(a.id.slice(1)));
    if (a.at > lastAt) lastAt = a.at;
  }
  const at = today >= lastAt ? today : lastAt;
  const added = { sources: 0, seeds: 0, handcheck: 0 };

  const active = new Map(article.facts.map((f) => [f.id, f]));
  const retired = new Map((article.retired ?? []).map((f) => [f.id, f]));
  const factOfWording = new Map<string, string>();
  for (const f of [...article.facts, ...(article.retired ?? [])])
    for (const w of [...f.wordings, ...(f.retiredWordings ?? [])]) factOfWording.set(w.id, f.id);

  /** The source id for a citation, adding it (or filling its date) when new. */
  const sourceFor = (c: Citation): string | null => {
    const url = normalizeUrl(c.url);
    if (!url) {
      skipped.push(`${article.id}: not a URL ${c.url}`);
      return null;
    }
    const have = byUrl.get(url);
    if (have) return have;
    const id = `s${++maxS}`;
    byUrl.set(url, id);
    sources[id] = {
      url,
      ...(c.title?.trim() ? { title: c.title.trim().slice(0, 300) } : {}),
      kind: inferKind(url),
      lang: c.lang && /^[a-z]{2}$/.test(c.lang) ? c.lang : inferLang(url),
      retrievedAt: c.at ?? today,
    };
    added.sources++;
    return id;
  };

  // Earliest history date per fact (incl. its wordings): when its source was first cited.
  const firstAt = new Map<string, string>();
  for (const e of inputs.history) {
    const fid =
      e.target.type === "fact"
        ? e.target.id
        : e.target.type === "wording"
          ? factOfWording.get(e.target.id)
          : undefined;
    if (fid && (!firstAt.has(fid) || e.at < (firstAt.get(fid) ?? ""))) firstAt.set(fid, e.at);
  }

  // Citations per active fact, in a fixed order: own source, history, transcripts.
  const cites = new Map<string, Citation[]>();
  for (const f of article.facts) {
    const list: Citation[] = [
      { ...f.source, at: firstAt.get(f.id), why: "fact source" },
    ];
    for (const e of inputs.history) {
      const fid =
        e.target.type === "fact"
          ? e.target.id
          : e.target.type === "wording"
            ? factOfWording.get(e.target.id)
            : undefined;
      if (fid !== f.id) continue;
      for (const s of e.sources ?? [])
        list.push({ url: s.url, title: s.title, at: e.at, why: `history entry seq ${e.seq}` });
    }
    for (const w of f.wordings) {
      if (!w.printed) continue;
      const t = inputs.transcripts.get(`${w.printed.source}/${w.printed.card}/${w.printed.category}`);
      if (t) list.push({ ...t, at: firstAt.get(f.id), why: `transcript ${w.printed.card}` });
    }
    cites.set(f.id, list);
  }

  // Sources are numbered in citation order: facts first, then article-level history.
  const pairs = new Map<string, { fact: string; sid: string; why: string[] }>();
  for (const f of article.facts) {
    for (const c of cites.get(f.id) ?? []) {
      const sid = sourceFor(c);
      if (!sid) continue;
      const k = `${f.id}/${sid}`;
      const p = pairs.get(k);
      if (p) {
        if (!p.why.includes(c.why)) p.why.push(c.why);
      } else pairs.set(k, { fact: f.id, sid, why: [c.why] });
    }
  }
  for (const e of inputs.history) {
    if (e.target.type !== "article") continue;
    for (const s of e.sources ?? [])
      sourceFor({ url: s.url, title: s.title, at: e.at, why: `history entry seq ${e.seq}` });
  }

  // Hand-check verdicts: resolved to a fact of this article.
  const verdicts: { v: HandcheckVerdict; fact: AnyFact; sids: string[] }[] = [];
  for (const v of inputs.handcheck) {
    if (v.verdict === "needs-placement") {
      skipped.push(`${v.ref}: needs-placement (no fact to assess)`);
      continue;
    }
    let fact: AnyFact | undefined = active.get(v.fact);
    if (!fact && v.wording) {
      const fid = factOfWording.get(v.wording);
      fact = fid ? active.get(fid) : undefined;
    }
    fact ??= retired.get(v.fact);
    if (!fact) {
      skipped.push(`${v.ref}: fact ${v.fact} not in ${article.id}`);
      continue;
    }
    const sids: string[] = [];
    for (const url of v.sources) {
      const sid = sourceFor({ url, at: today, why: "handcheck" });
      if (sid && !sids.includes(sid)) sids.push(sid);
    }
    verdicts.push({ v, fact, sids });
  }
  const handchecked = new Set(verdicts.flatMap(({ fact, sids }) => sids.map((s) => `${fact.id}/${s}`)));

  const has = (pred: (a: Assessment) => boolean) => assessments.some(pred);
  const push = (a: Omit<Assessment, "id" | "at">) => {
    assessments.push({ id: `e${++maxE}`, at, ...a });
  };

  for (const { fact, sid, why } of pairs.values()) {
    if (handchecked.has(`${fact}/${sid}`)) continue;
    if (has((a) => a.target === fact && a.support.some((s) => s.source === sid))) continue;
    const f = active.get(fact);
    if (!f) continue;
    push({
      target: fact,
      claim: "answer",
      verdict: "unverified",
      confidence: "low",
      support: [{ source: sid, ...answerIn(f, sources[sid].lang), verbatim: false }],
      by: BACKFILL_BY,
      run: BACKFILL_RUN,
      note: `backfill: cited by ${why.join("; ")}`,
    });
    added.seeds++;
  }

  for (const { v, fact, sids } of verdicts) {
    if (has((a) => a.by === HANDCHECK_BY && a.run === HANDCHECK_RUN && a.target === fact.id))
      continue;
    // A contest of the CARD that the worker resolved in the bank (narrowed the
    // question, accepted alternatives) leaves the bank's answer standing.
    const resolved = v.verdict === "contested" && v.changes.trim() !== "";
    const verdict = v.verdict === "contested" && !resolved ? "contested" : "confirmed";
    const note =
      v.verdict === "fixed"
        ? `after fix (${v.ref}, ${v.unit}): ${v.why}`
        : resolved
          ? `card contested, the bank narrowed to what is settled (${v.ref}, ${v.unit}): ${v.why}`
          : `${v.ref}, ${v.unit}: ${v.why}`;
    push({
      target: fact.id,
      claim: "answer",
      verdict,
      confidence: resolved && v.confidence === "high" ? "medium" : v.confidence,
      support: sids.map((sid) => ({ source: sid, ...answerIn(fact, sources[sid].lang), verbatim: false })),
      by: HANDCHECK_BY,
      run: HANDCHECK_RUN,
      note,
    });
    added.handcheck++;
  }

  const evidence: ArticleEvidence = { article: article.id, sources, assessments };
  const changed =
    !existing ||
    added.sources > 0 ||
    assessments.length !== existing.assessments.length;
  return { evidence, changed, added, skipped };
}

// ── CLI ──────────────────────────────────────────────────────────────────

export async function main(argv: string[]): Promise<void> {
  const flags = new Map<string, string>();
  for (const a of argv) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a);
    if (!m) throw new Error(`unexpected argument ${a}`);
    flags.set(m[1], m[2] ?? "true");
  }
  for (const k of flags.keys())
    if (!["articles", "dry-run", "content-dir"].includes(k)) throw new Error(`unknown flag --${k}`);
  const dir = flags.get("content-dir") ?? DEFAULT_CONTENT_DIR;
  const dryRun = flags.has("dry-run");
  const only = flags.get("articles")?.split(",").filter(Boolean);
  const archive = join(REPO, "packages/quiz-archive");
  const transcripts = loadTranscripts(join(archive, "transcripts"));
  const handcheck = loadHandcheck(join(archive, "runs", HANDCHECK_RUN));
  const ids = readdirSync(join(dir, "articles"))
    .filter((f) => /^a\d{4,}\.json$/.test(f))
    .map((f) => f.slice(0, -5))
    .filter((id) => !only || only.includes(id))
    .sort();

  const tally = { articles: 0, written: 0, sources: 0, seeds: 0, handcheck: 0, problems: 0 };
  const skipped: string[] = [];
  for (const id of ids) {
    const article = ArticleSchema.parse(
      JSON.parse(readFileSync(join(dir, "articles", `${id}.json`), "utf8")),
    );
    if (article.articleRetired) continue;
    tally.articles++;
    const hp = join(dir, "history", `${id}.json`);
    const history = existsSync(hp)
      ? (JSON.parse(readFileSync(hp, "utf8")) as { entries: HistoryEntryLike[] }).entries
      : [];
    const ep = join(dir, "evidence", `${id}.json`);
    const existing = existsSync(ep)
      ? ArticleEvidenceSchema.parse(JSON.parse(readFileSync(ep, "utf8")))
      : null;
    const r = backfillArticle(article, existing, {
      history,
      transcripts,
      handcheck: handcheck.get(id) ?? [],
    });
    skipped.push(...r.skipped);
    if (!r.changed) continue;
    const parsed = ArticleEvidenceSchema.parse(r.evidence);
    const problems = evidenceProblems(article, parsed);
    if (problems.length) {
      tally.problems += problems.length;
      process.stderr.write(`${problems.join("\n")}\n`);
      continue;
    }
    tally.sources += r.added.sources;
    tally.seeds += r.added.seeds;
    tally.handcheck += r.added.handcheck;
    tally.written++;
    if (!dryRun) atomicWrite(ep, toJson(r.evidence));
  }
  for (const s of skipped) process.stdout.write(`  skip ${s}\n`);
  process.stdout.write(
    `backfill${dryRun ? " (dry run)" : ""}: ${tally.articles} article(s), ${tally.written} ledger(s) written, +${tally.sources} source(s), +${tally.seeds} seed(s), +${tally.handcheck} hand-check assessment(s), ${tally.problems} problem(s)\n`,
  );
  if (tally.problems) process.exitCode = 1;
}
