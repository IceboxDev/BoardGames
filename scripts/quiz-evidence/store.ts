// The crawler's files: evidence ledgers (read raw, validated, written
// atomically under a per-article lock), gzipped text snapshots (one per
// distinct text, named by its sha256) and the resumable crawl state.

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { type Article, ArticleSchema } from "../../packages/core/src/quiz/content-types.ts";
import {
  type ArticleEvidence,
  ArticleEvidenceSchema,
  evidenceProblems,
} from "../../packages/core/src/quiz/evidence-types.ts";

export const REPO = new URL("../../", import.meta.url).pathname;
export const DEFAULT_CONTENT_DIR = join(REPO, "packages/core/src/quiz/content");
export const DEFAULT_SNAPSHOT_DIR = join(REPO, "packages/quiz-archive/snapshots");
/** Transient: outside content/ and outside the LFS-tracked snapshots folder. */
export const DEFAULT_STATE_FILE = join(REPO, "scratch/quiz-evidence/crawl-state.json");

/** Write a file via a temp file in the same folder and a rename. */
export function atomicWrite(path: string, data: string | Uint8Array): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = join(
    dirname(path),
    `.${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2)}.tmp`,
  );
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}

export const toJson = (v: unknown): string => `${JSON.stringify(v, null, 1)}\n`;

// ── Articles & evidence ──────────────────────────────────────────────────

export class Content {
  private articles = new Map<string, Article | null>();
  private locks = new Map<string, Promise<unknown>>();
  constructor(readonly dir: string) {}

  get evidenceDir(): string {
    return join(this.dir, "evidence");
  }

  /** Article ids with a ledger, sorted. */
  evidenceIds(): string[] {
    if (!existsSync(this.evidenceDir)) return [];
    return readdirSync(this.evidenceDir)
      .filter((f) => /^a\d{4,}\.json$/.test(f))
      .map((f) => f.slice(0, -5))
      .sort();
  }

  articleIds(): string[] {
    const d = join(this.dir, "articles");
    if (!existsSync(d)) return [];
    return readdirSync(d)
      .filter((f) => /^a\d{4,}\.json$/.test(f))
      .map((f) => f.slice(0, -5))
      .sort();
  }

  article(id: string): Article | null {
    if (!this.articles.has(id)) {
      const p = join(this.dir, "articles", `${id}.json`);
      this.articles.set(
        id,
        existsSync(p) ? ArticleSchema.parse(JSON.parse(readFileSync(p, "utf8"))) : null,
      );
    }
    return this.articles.get(id) ?? null;
  }

  readEvidence(id: string): ArticleEvidence | null {
    const p = join(this.evidenceDir, `${id}.json`);
    if (!existsSync(p)) return null;
    const raw: unknown = JSON.parse(readFileSync(p, "utf8"));
    ArticleEvidenceSchema.parse(raw);
    // The raw object (not zod's output) is what gets written back, so a field
    // this crawler doesn't know about survives.
    return raw as ArticleEvidence;
  }

  /**
   * Read-modify-write one ledger under a per-article lock. `fn` returns the
   * new ledger, or null for no change. The result must parse, satisfy
   * `evidenceProblems` and keep every existing assessment byte-identical —
   * otherwise nothing is written and this throws.
   */
  update(id: string, fn: (ev: ArticleEvidence) => ArticleEvidence | null): Promise<boolean> {
    const prev = this.locks.get(id) ?? Promise.resolve();
    const run = prev.then(() => {
      const ev = this.readEvidence(id);
      if (!ev) throw new Error(`no evidence/${id}.json`);
      const next = fn(ev);
      if (!next) return false;
      const parsed = ArticleEvidenceSchema.parse(next);
      const article = this.article(id);
      if (!article) throw new Error(`evidence/${id}: no article ${id}`);
      const problems = evidenceProblems(article, parsed);
      if (problems.length > 0) throw new Error(problems.join("\n"));
      const before = ev.assessments.map((a) => JSON.stringify(a));
      const after = next.assessments.slice(0, before.length).map((a) => JSON.stringify(a));
      if (after.length !== before.length || before.some((b, i) => b !== after[i]))
        throw new Error(`evidence/${id}: an existing assessment would change`);
      atomicWrite(join(this.evidenceDir, `${id}.json`), toJson(next));
      return true;
    });
    this.locks.set(
      id,
      run.catch(() => {}),
    );
    return run;
  }
}

// ── Snapshots ────────────────────────────────────────────────────────────

export const sha256 = (text: string): string =>
  createHash("sha256").update(text, "utf8").digest("hex");

/** Store a text snapshot (deduplicated by hash); returns its sha256. */
export function writeSnapshot(dir: string, text: string): string {
  const hash = sha256(text);
  const p = join(dir, `${hash}.txt.gz`);
  if (!existsSync(p)) atomicWrite(p, gzipSync(Buffer.from(text, "utf8"), { level: 9 }));
  return hash;
}

/** A snapshot's text; null when missing or only an LFS pointer (not gzip). */
export function readSnapshot(dir: string, hash: string): string | null {
  const p = join(dir, `${hash}.txt.gz`);
  if (!existsSync(p)) return null;
  const buf = readFileSync(p);
  if (buf.length < 2 || buf[0] !== 0x1f || buf[1] !== 0x8b) return null;
  return gunzipSync(buf).toString("utf8");
}

// ── Crawl state ──────────────────────────────────────────────────────────

export interface UrlState {
  fetch?: {
    status: "ok" | "failed";
    reason?: string;
    httpStatus?: number;
    finalUrl?: string;
    via?: string;
    snapshot?: string;
    chars?: number;
    attempts: number;
    at: string;
  };
  wayback?: {
    status: "ok" | "failed";
    reason?: string;
    archiveUrl?: string;
    via?: string;
    attempts: number;
    at: string;
  };
}

export interface CrawlState {
  version: 1;
  urls: Record<string, UrlState>;
}

export class StateFile {
  state: CrawlState;
  constructor(readonly path: string) {
    this.state = existsSync(path)
      ? (JSON.parse(readFileSync(path, "utf8")) as CrawlState)
      : { version: 1, urls: {} };
  }
  get(url: string): UrlState {
    this.state.urls[url] ??= {};
    return this.state.urls[url];
  }
  save(): void {
    atomicWrite(this.path, toJson(this.state));
  }
}
