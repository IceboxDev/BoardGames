// Research reports on disk: a commissioned deep-research PDF answering one
// backlog item, archived byte-exact as `quiz-archive/research-reports/
// <bNNNNN>.pdf` (LFS) beside a `<bNNNNN>.json` manifest, its extracted text
// kept as an ordinary snapshot (`quiz-archive/snapshots/<sha256>.txt.gz`) so
// quotes from it count as verbatim-verified, and registered as a
// `research-report` source in the target article's evidence ledger — the
// highest-ranking source there is (`grade.ts`). Assessments citing it are
// then added with `quiz-ingest evidence add --url=<its url>`.

import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { BacklogItem } from "../../../packages/core/src/quiz/backlog-types.ts";
import {
  type ArticleEvidence,
  ArticleEvidenceSchema,
  type EvidenceSource,
  evidenceProblems,
  RESEARCH_REPORT_KIND,
  type ResearchReportRef,
} from "../../../packages/core/src/quiz/evidence-types.ts";
import { writeFileAtomic } from "./content-io.ts";

export const ARCHIVE_DIR = new URL("../../../packages/quiz-archive/", import.meta.url).pathname;
/** Where archived files are served from: GitHub's LFS media endpoint for master. */
export const ARCHIVE_URL_BASE =
  "https://media.githubusercontent.com/media/IceboxDev/BoardGames/master/packages/quiz-archive/";

export interface ReportManifest {
  backlog: string;
  target: string;
  article: string;
  title: string;
  originalName: string;
  file: string;
  sha256: string;
  bytes: number;
  pages: number;
  producer?: string;
  receivedAt: string;
  /** sha256 of the extracted text (`snapshots/<it>.txt.gz`). */
  textSnapshot: string;
  url: string;
}

const sha256 = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");

/**
 * The archive path for a report on `backlog`: `<b>.pdf`, or `<b>-2.pdf`… when
 * a different report on the same item is already there. Returns the existing
 * path when these exact bytes are already archived.
 */
export function reportFile(
  backlog: string,
  pdfSha: string,
  archiveDir = ARCHIVE_DIR,
): { file: string; existing: boolean } {
  for (let k = 1; ; k++) {
    const file = `research-reports/${backlog}${k === 1 ? "" : `-${k}`}.pdf`;
    const p = join(archiveDir, file);
    if (!existsSync(p)) return { file, existing: false };
    if (sha256(readFileSync(p)) === pdfSha) return { file, existing: true };
  }
}

/** The ledger with the report registered as a source (pure; throws on a broken ledger). */
export function withReportSource(
  article: { id: string; facts: readonly { id: string }[]; retired?: readonly { id: string }[] },
  ledger: ArticleEvidence | undefined,
  m: Pick<ReportManifest, "url" | "title" | "producer" | "receivedAt" | "textSnapshot">,
  report: ResearchReportRef,
): { ledger: ArticleEvidence; sourceId: string; newSource: boolean } {
  const base: ArticleEvidence = ledger ?? { article: article.id, sources: {}, assessments: [] };
  const known = Object.entries(base.sources).find(([, s]) => s.url === m.url)?.[0];
  if (known) return { ledger: base, sourceId: known, newSource: false };
  const n = Math.max(0, ...Object.keys(base.sources).map((id) => Number(id.slice(1)) || 0)) + 1;
  const sourceId = `s${n}`;
  const source: EvidenceSource = {
    url: m.url,
    title: m.title,
    ...(m.producer ? { publisher: m.producer } : {}),
    kind: RESEARCH_REPORT_KIND,
    lang: "en",
    retrievedAt: m.receivedAt,
    snapshot: m.textSnapshot,
    report,
  };
  const parsed = ArticleEvidenceSchema.parse({
    ...base,
    sources: { ...base.sources, [sourceId]: source },
  });
  const problems = evidenceProblems(article, parsed);
  if (problems.length > 0) throw new Error(problems.join("; "));
  return { ledger: parsed, sourceId, newSource: true };
}

/**
 * Archive the PDF and its manifest (idempotent for the same bytes) and return
 * the manifest. `text` is the PDF's extracted text, already stored as a
 * snapshot whose hash is `textSnapshot`.
 */
export function archiveReport(opts: {
  pdfPath: string;
  item: BacklogItem;
  article: string;
  title: string;
  pages: number;
  producer?: string;
  receivedAt: string;
  textSnapshot: string;
  archiveDir?: string;
}): ReportManifest {
  const archiveDir = opts.archiveDir ?? ARCHIVE_DIR;
  const bytes = readFileSync(opts.pdfPath);
  const pdfSha = sha256(bytes);
  const { file, existing } = reportFile(opts.item.id, pdfSha, archiveDir);
  mkdirSync(join(archiveDir, "research-reports"), { recursive: true });
  if (!existing) copyFileSync(opts.pdfPath, join(archiveDir, file));
  const manifest: ReportManifest = {
    backlog: opts.item.id,
    target: opts.item.target,
    article: opts.article,
    title: opts.title,
    originalName: basename(opts.pdfPath),
    file,
    sha256: pdfSha,
    bytes: bytes.length,
    pages: opts.pages,
    ...(opts.producer ? { producer: opts.producer } : {}),
    receivedAt: opts.receivedAt,
    textSnapshot: opts.textSnapshot,
    url: ARCHIVE_URL_BASE + file,
  };
  writeFileAtomic(
    join(archiveDir, file.replace(/\.pdf$/, ".json")),
    `${JSON.stringify(manifest, null, 1)}\n`,
  );
  return manifest;
}

export const reportRef = (m: ReportManifest): ResearchReportRef => ({
  file: m.file,
  sha256: m.sha256,
  pages: m.pages,
  backlog: m.backlog,
  receivedAt: m.receivedAt,
  ...(m.producer ? { producer: m.producer } : {}),
});
