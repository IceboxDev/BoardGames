// The evidence ledger: `content/evidence/aNNNN.json`, one per article,
// append-only. `sources` are the pages consulted (with a text snapshot and
// an archive copy once crawled); `assessments` are dated judgements — by a
// crawler, an agent or a person — that a source confirms, contests or
// refutes one claim (a fact's answer, its premise, a number in the body,
// what the printed card says), each backed by quotes. Nothing is edited or
// removed: a later assessment supersedes an earlier one (`grade.ts` reads
// the latest per source). Browser-safe.

import { z } from "zod";
import { ArticleIdSchema } from "./content-types.ts";
import { ConfidenceSchema, RunIdSchema } from "./history-schema.ts";
import { ASSESSMENT_ID_RE, EVIDENCE_SOURCE_ID_RE, FACT_ID_RE } from "./ids.ts";

export const SOURCE_KINDS = [
  "primary",
  "official",
  "scholarly",
  "reference",
  "encyclopedia",
  "press",
  "book",
  "fan",
  "other",
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];
/** Kinds that make a source authoritative for grade A. */
export const PRIMARY_KINDS: ReadonlySet<SourceKind> = new Set(["primary", "official", "scholarly"]);

export const CLAIMS = ["answer", "premise", "body-number", "card-says"] as const;
export type Claim = (typeof CLAIMS)[number];

export const VERDICTS = ["confirmed", "contested", "refuted", "unverified"] as const;
export type Verdict = (typeof VERDICTS)[number];

export const EvidenceSourceIdSchema = z.string().regex(EVIDENCE_SOURCE_ID_RE);
export const AssessmentIdSchema = z.string().regex(ASSESSMENT_ID_RE);

/** `YYYY-MM-DD` or a full ISO timestamp. */
const WhenSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))?$/);
const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
/** A bare host name (`wikiwand.com`). */
const DomainSchema = z.string().regex(/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/);

export const EvidenceSourceSchema = z.object({
  url: z.url({ protocol: /^https?$/ }),
  title: z.string().min(1).optional(),
  publisher: z.string().min(1).optional(),
  kind: z.enum(SOURCE_KINDS),
  /** ISO 639-1 of the page. */
  lang: z.string().regex(/^[a-z]{2}$/),
  retrievedAt: WhenSchema,
  /** A Wayback Machine (or other archive) copy. */
  archiveUrl: z.url({ protocol: /^https?$/ }).optional(),
  /** sha256 of the stored text snapshot (`quiz-archive/snapshots/<sha256>.txt.gz`). */
  snapshot: Sha256Schema.optional(),
  /** Copies another source of this ledger (`s3`) or a site (`wikipedia.org`): not independent. */
  cloneOf: z.union([EvidenceSourceIdSchema, DomainSchema]).optional(),
});
export type EvidenceSource = z.infer<typeof EvidenceSourceSchema>;

export const EvidenceSupportSchema = z.object({
  source: EvidenceSourceIdSchema,
  quote: z.string().min(1),
  /** ISO 639-1 of the quote. */
  quoteLang: z.string().regex(/^[a-z]{2}$/),
  /** The quote states the claim word for word (the answer appears verbatim). */
  verbatim: z.boolean(),
  /** When a machine found the quote on the page (crawler / snapshot check). */
  verifiedAt: WhenSchema.optional(),
});
export type EvidenceSupport = z.infer<typeof EvidenceSupportSchema>;

/** `fNNNNN` (a fact's answer, premise, card) or `aNNNN:body` (the article's body). */
export const AssessmentTargetSchema = z
  .string()
  .refine((t) => FACT_ID_RE.test(t) || /^a\d{4,}:body$/.test(t), {
    message: 'Expected a fact id or "aNNNN:body"',
  });

export const AssessmentSchema = z.object({
  id: AssessmentIdSchema,
  at: WhenSchema,
  target: AssessmentTargetSchema,
  claim: z.enum(CLAIMS),
  verdict: z.enum(VERDICTS),
  confidence: ConfidenceSchema,
  support: z.array(EvidenceSupportSchema),
  /** "crawler", "owner", "research batch 07" … */
  by: z.string().min(1),
  run: RunIdSchema.optional(),
  /** A short note for the reader (what was contested, what the quote shows). */
  note: z.string().min(1).optional(),
});
export type Assessment = z.infer<typeof AssessmentSchema>;

export const ArticleEvidenceSchema = z.object({
  article: ArticleIdSchema,
  sources: z.record(EvidenceSourceIdSchema, EvidenceSourceSchema),
  /** Append-only, oldest first. */
  assessments: z.array(AssessmentSchema),
});
export type ArticleEvidence = z.infer<typeof ArticleEvidenceSchema>;

/** A history entry's evidence ref (`e12` or `a0042/e12`) → its article and assessment ids. */
export function parseEvidenceRef(
  ref: string,
  article: string,
): { article: string; id: string } | null {
  const m = /^(?:(a\d{4,})\/)?(e\d+)$/.exec(ref);
  return m ? { article: m[1] ?? article, id: m[2] } : null;
}

interface ArticleLike {
  id: string;
  facts: readonly { id: string }[];
  retired?: readonly { id: string }[];
}

/**
 * The ledger's own invariants: it is the article's, assessment ids are
 * unique, assessments are in order of `at` (append-only), every target is
 * one of the article's facts (retired included) or its body, every quote
 * names a known source, and `cloneOf` names a known source (not itself).
 */
export function evidenceProblems(article: ArticleLike, evidence: ArticleEvidence): string[] {
  const where = `evidence/${article.id}`;
  const problems: string[] = [];
  if (evidence.article !== article.id) problems.push(`${where}: file is for ${evidence.article}`);
  const facts = new Set([...article.facts, ...(article.retired ?? [])].map((f) => f.id));
  for (const [id, s] of Object.entries(evidence.sources)) {
    if (s.cloneOf && EVIDENCE_SOURCE_ID_RE.test(s.cloneOf)) {
      if (s.cloneOf === id) problems.push(`${where}/${id}: a clone of itself`);
      else if (!evidence.sources[s.cloneOf])
        problems.push(`${where}/${id}: clone of unknown source ${s.cloneOf}`);
    }
  }
  const ids = new Set<string>();
  let last = "";
  for (const a of evidence.assessments) {
    if (ids.has(a.id)) problems.push(`${where}: duplicate assessment ${a.id}`);
    ids.add(a.id);
    if (a.at < last) problems.push(`${where}/${a.id}: out of order (${a.at} after ${last})`);
    if (a.at > last) last = a.at;
    if (a.target.includes(":")) {
      if (a.target !== `${article.id}:body`)
        problems.push(`${where}/${a.id}: unknown target ${a.target}`);
    } else if (!facts.has(a.target)) {
      problems.push(`${where}/${a.id}: unknown target ${a.target}`);
    }
    for (const s of a.support) {
      if (!evidence.sources[s.source])
        problems.push(`${where}/${a.id}: unknown source ${s.source}`);
    }
  }
  return problems;
}
