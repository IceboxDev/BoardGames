// A fact's research grade, computed from its evidence ledger and never set
// by hand. Only INDEPENDENT sources count: pages on one site are one source,
// every language edition of Wikipedia and its mirrors are one source, and a
// source marked `cloneOf` joins the family of what it copies.
//
//   A  ≥2 independent sources, all verbatim-verified, ≥1 primary / official /
//      scholarly, nothing contested
//   B  ≥2 independent verbatim-verified sources, or 1 primary verbatim-verified
//   C  1 source with the answer verbatim-verified on its page
//   D  a source is given, but the answer wasn't verified on it (or it has no
//      snapshot)
//   E  no source, or a contest / refutation nobody has resolved
//
// "Verbatim-verified" is a supporting quote marked `verbatim` that a machine
// checked on the page — the source has a `snapshot`, or the quote a
// `verifiedAt`. A source counts with its LATEST answer assessment; the claim
// is contested when the latest decisive (non-`unverified`) assessment of the
// answer or premise contests or refutes it — a later confirmation resolves it.

import {
  type ArticleEvidence,
  type Assessment,
  type EvidenceSource,
  type EvidenceSupport,
  PRIMARY_KINDS,
} from "./evidence-types.ts";
import type { Confidence } from "./history-schema.ts";

export const GRADES = ["A", "B", "C", "D", "E"] as const;
export type Grade = (typeof GRADES)[number];

/**
 * Hosts known to copy another site, mapped to the site they copy (matched on
 * the host or any parent domain). Wikipedia's language editions and Wikidata
 * fold into `wikipedia.org` through their registrable domain already.
 */
export const CLONE_DOMAINS: Readonly<Record<string, string>> = {
  "wikiwand.com": "wikipedia.org",
  "dbpedia.org": "wikipedia.org",
  "wikizero.com": "wikipedia.org",
  "everybodywiki.com": "wikipedia.org",
  "academic-accelerator.com": "wikipedia.org",
  "alchetron.com": "wikipedia.org",
  "wikimili.com": "wikipedia.org",
  "wiki2.org": "wikipedia.org",
  "wikibrief.org": "wikipedia.org",
  "infogalactic.com": "wikipedia.org",
  "unionpedia.org": "wikipedia.org",
  "zxc.wiki": "wikipedia.org",
  "second.wiki": "wikipedia.org",
  "de-academic.com": "wikipedia.org",
  "en-academic.com": "wikipedia.org",
  "deacademic.com": "wikipedia.org",
  "enacademic.com": "wikipedia.org",
  "dewiki.de": "wikipedia.org",
  "wiki.edu.vn": "wikipedia.org",
  "wikiital.com": "wikipedia.org",
  "justapedia.org": "wikipedia.org",
  "encyclopedia2.thefreedictionary.com": "wikipedia.org",
  "wikidata.org": "wikipedia.org",
  "wikimedia.org": "wikipedia.org",
  "m.wikipedia.org": "wikipedia.org",
};

/** Second-level labels under which a registrable domain takes three labels. */
const SECOND_LEVEL = new Set([
  "co",
  "com",
  "ac",
  "gov",
  "org",
  "net",
  "edu",
  "or",
  "ne",
  "go",
  "gv",
]);

/** `de.m.wikipedia.org` → `wikipedia.org`, `www.bbc.co.uk` → `bbc.co.uk`. */
export function registrableDomain(host: string): string {
  const labels = host.toLowerCase().replace(/\.$/, "").split(".");
  if (labels.length <= 2) return labels.join(".");
  const sld = labels[labels.length - 2];
  const take = SECOND_LEVEL.has(sld) && labels[labels.length - 1].length === 2 ? 3 : 2;
  return labels.slice(-take).join(".");
}

/** The family a site belongs to: the site it mirrors, else its registrable domain. */
export function domainFamily(
  host: string,
  cloneDomains: Readonly<Record<string, string>> = CLONE_DOMAINS,
): string {
  const h = host.toLowerCase();
  for (const [mirror, of] of Object.entries(cloneDomains)) {
    if (h === mirror || h.endsWith(`.${mirror}`)) return registrableDomain(of);
  }
  return registrableDomain(h);
}

/** The independence family of a ledger source (following `cloneOf` chains). */
export function sourceFamily(
  id: string,
  sources: Readonly<Record<string, EvidenceSource>>,
  cloneDomains: Readonly<Record<string, string>> = CLONE_DOMAINS,
): string {
  const seen = new Set<string>();
  let cur = id;
  for (;;) {
    const s = sources[cur];
    if (!s) return `?${cur}`;
    if (s.cloneOf && /^s\d+$/.test(s.cloneOf) && !seen.has(s.cloneOf)) {
      seen.add(cur);
      cur = s.cloneOf;
      continue;
    }
    if (s.cloneOf && !/^s\d+$/.test(s.cloneOf)) return domainFamily(s.cloneOf, cloneDomains);
    let host: string;
    try {
      host = new URL(s.url).hostname;
    } catch {
      return `?${cur}`;
    }
    return domainFamily(host, cloneDomains);
  }
}

export interface FactGrade {
  grade: Grade;
  /** Independent source families that confirm the answer. */
  independentSources: number;
  /** Of those, the families with a verbatim-verified quote. */
  verbatim: number;
  /** Families with a primary / official / scholarly source verbatim-verified. */
  primary: number;
  /** An unresolved contest or refutation of the answer or premise. */
  contested: boolean;
  /** The confidence of the fact's latest assessment, null without one. */
  latestConfidence: Confidence | null;
}

const ANSWER_CLAIMS = new Set(["answer"]);
const CONTEST_CLAIMS = new Set(["answer", "premise"]);

const verified = (s: EvidenceSource | undefined, sup: EvidenceSupport) =>
  sup.verbatim && (s?.snapshot !== undefined || sup.verifiedAt !== undefined);

/** The fact's grade and the counts behind it. */
export function factGrade(
  factId: string,
  evidence: ArticleEvidence | undefined,
  cloneDomains: Readonly<Record<string, string>> = CLONE_DOMAINS,
): FactGrade {
  const none: FactGrade = {
    grade: "E",
    independentSources: 0,
    verbatim: 0,
    primary: 0,
    contested: false,
    latestConfidence: null,
  };
  if (!evidence) return none;
  // Stable order by `at` (ties keep file order), so "latest" is well defined.
  const mine = evidence.assessments
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => a.target === factId)
    .sort((x, y) => (x.a.at < y.a.at ? -1 : x.a.at > y.a.at ? 1 : x.i - y.i))
    .map(({ a }) => a);
  if (mine.length === 0) return none;

  let contested = false;
  for (const a of mine) {
    if (!CONTEST_CLAIMS.has(a.claim) || a.verdict === "unverified") continue;
    contested = a.verdict !== "confirmed";
  }

  // Latest answer assessment per source.
  const latest = new Map<string, { a: Assessment; sup: EvidenceSupport }>();
  for (const a of mine) {
    if (!ANSWER_CLAIMS.has(a.claim)) continue;
    for (const sup of a.support) latest.set(sup.source, { a, sup });
  }

  const families = new Map<string, { verbatim: boolean; primary: boolean }>();
  for (const [id, { a, sup }] of latest) {
    if (a.verdict !== "confirmed") continue;
    const s = evidence.sources[id];
    const fam = sourceFamily(id, evidence.sources, cloneDomains);
    const cur = families.get(fam) ?? { verbatim: false, primary: false };
    const v = verified(s, sup);
    cur.verbatim ||= v;
    cur.primary ||= v && s !== undefined && PRIMARY_KINDS.has(s.kind);
    families.set(fam, cur);
  }
  const independentSources = families.size;
  const verbatim = [...families.values()].filter((f) => f.verbatim).length;
  const primary = [...families.values()].filter((f) => f.primary).length;
  const anySource = latest.size > 0;

  let grade: Grade;
  if (contested || !anySource) grade = "E";
  else if (verbatim >= 2 && verbatim === independentSources && primary >= 1) grade = "A";
  else if (verbatim >= 2 || primary >= 1) grade = "B";
  else if (verbatim >= 1) grade = "C";
  else grade = "D";

  return {
    grade,
    independentSources,
    verbatim,
    primary,
    contested,
    latestConfidence: mine[mine.length - 1].confidence,
  };
}

/** How many facts have each grade. */
export function gradeDistribution(grades: Iterable<Grade>): Record<Grade, number> {
  const out: Record<Grade, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  for (const g of grades) out[g]++;
  return out;
}
