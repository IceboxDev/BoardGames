// The evidence ledger on disk: `content/evidence/aNNNN.json`, one per
// article, append-only (core `quiz/evidence-types.ts`, grades in `grade.ts`).
// `addEvidence` is pure: it returns the ledger with one more assessment (and
// the source, unless the ledger already cites that URL) or throws when the
// result breaks a ledger invariant.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { Article } from "../../../packages/core/src/quiz/content-types.ts";
import {
  type ArticleEvidence,
  ArticleEvidenceSchema,
  type Assessment,
  type Claim,
  type EvidenceSource,
  evidenceProblems,
  type SourceKind,
  type Verdict,
} from "../../../packages/core/src/quiz/evidence-types.ts";
import type { Confidence } from "../../../packages/core/src/quiz/history-schema.ts";
import { CONTENT_DIR, writeFileAtomic } from "./content-io.ts";

export const evidenceDir = (contentDir = CONTENT_DIR) => join(contentDir, "evidence");

export function evidencePath(articleId: string, contentDir = CONTENT_DIR): string {
  return join(evidenceDir(contentDir), `${articleId}.json`);
}

export function readEvidence(
  articleId: string,
  contentDir = CONTENT_DIR,
): ArticleEvidence | undefined {
  const p = evidencePath(articleId, contentDir);
  if (!existsSync(p)) return undefined;
  return ArticleEvidenceSchema.parse(JSON.parse(readFileSync(p, "utf8")));
}

export function readAllEvidence(contentDir = CONTENT_DIR): Map<string, ArticleEvidence> {
  const out = new Map<string, ArticleEvidence>();
  const dir = evidenceDir(contentDir);
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)
    .filter((x) => x.endsWith(".json"))
    .sort()) {
    out.set(
      basename(f, ".json"),
      ArticleEvidenceSchema.parse(JSON.parse(readFileSync(join(dir, f), "utf8"))),
    );
  }
  return out;
}

export function writeEvidence(ev: ArticleEvidence, contentDir = CONTENT_DIR): void {
  writeFileAtomic(
    evidencePath(ev.article, contentDir),
    `${JSON.stringify(ArticleEvidenceSchema.parse(ev), null, 1)}\n`,
  );
}

export interface EvidenceInput {
  /** `fNNNNN` or `aNNNN:body`. */
  target: string;
  claim: Claim;
  url: string;
  title?: string;
  publisher?: string;
  kind: SourceKind;
  lang: string;
  archiveUrl?: string;
  quote?: string;
  quoteLang?: string;
  verbatim: boolean;
  verdict: Verdict;
  confidence: Confidence;
  by: string;
  run?: string;
  note?: string;
  /** `YYYY-MM-DD` or an ISO timestamp. */
  at: string;
}

const nextId = (prefix: string, ids: Iterable<string>) =>
  `${prefix}${Math.max(0, ...[...ids].map((id) => Number(id.slice(1)) || 0)) + 1}`;

/** The ledger with the assessment appended (source reused by URL, else added as the next `sN`). */
export function addEvidence(
  article: Pick<Article, "id" | "facts" | "retired">,
  ledger: ArticleEvidence | undefined,
  input: EvidenceInput,
): { ledger: ArticleEvidence; sourceId: string; assessmentId: string; newSource: boolean } {
  const base: ArticleEvidence = ledger ?? { article: article.id, sources: {}, assessments: [] };
  const known = Object.entries(base.sources).find(([, s]) => s.url === input.url)?.[0];
  const sourceId = known ?? nextId("s", Object.keys(base.sources));
  const sources = { ...base.sources };
  if (!known) {
    const source: EvidenceSource = {
      url: input.url,
      ...(input.title ? { title: input.title } : {}),
      ...(input.publisher ? { publisher: input.publisher } : {}),
      kind: input.kind,
      lang: input.lang,
      retrievedAt: input.at,
      ...(input.archiveUrl ? { archiveUrl: input.archiveUrl } : {}),
    };
    sources[sourceId] = source;
  }
  const assessmentId = nextId(
    "e",
    base.assessments.map((a) => a.id),
  );
  const assessment: Assessment = {
    id: assessmentId,
    at: input.at,
    target: input.target,
    claim: input.claim,
    verdict: input.verdict,
    confidence: input.confidence,
    support: input.quote
      ? [
          {
            source: sourceId,
            quote: input.quote,
            quoteLang: input.quoteLang ?? input.lang,
            verbatim: input.verbatim,
          },
        ]
      : [],
    by: input.by,
    ...(input.run ? { run: input.run } : {}),
    ...(input.note ? { note: input.note } : {}),
  };
  const parsed = ArticleEvidenceSchema.safeParse({
    ...base,
    sources,
    assessments: [...base.assessments, assessment],
  });
  if (!parsed.success)
    throw new Error(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const problems = evidenceProblems(article, parsed.data);
  if (problems.length > 0) throw new Error(problems.join("; "));
  return { ledger: parsed.data, sourceId, assessmentId, newSource: !known };
}
