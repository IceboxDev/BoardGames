// The quiz card archive (`packages/quiz-archive/`) as the admin quiz desk
// reads it: per source the photo manifest, per card the verbatim
// transcription, per run its `run.json`. Everything is read lazily and
// cached; the archive is optional — the deployed server may not have it
// (photos are LFS and never fetched there), so every lookup returns null
// when the directory or a file is missing. Photos themselves are never read:
// the desk links GitHub's public LFS media URL (`photoUrl`).
//
// The directory is `QUIZ_ARCHIVE_DIR`, else resolved relative to this module
// (tsx dev and the tsup bundle) or the working directory, like the content.

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  QuizDeskPhotoManifest,
  QuizDeskTranscript,
} from "@boardgames/core/protocol/http/quiz-desk";
import { SourceLinkSchema } from "@boardgames/core/quiz/content-types";
import { z } from "zod";

export const ARCHIVE_DIR_ENV = "QUIZ_ARCHIVE_DIR";
/** Where the photos are served from: GitHub's LFS media endpoint for master. */
export const PHOTO_URL_BASE =
  "https://media.githubusercontent.com/media/IceboxDev/BoardGames/master/packages/quiz-archive/";
/** Transcript files kept in memory at once. */
export const TRANSCRIPT_CACHE_SIZE = 128;

/** A manifest `file` (`photos/<source>/<card>.jpg`) → its public URL. */
export function photoUrl(file: string): string {
  return `${PHOTO_URL_BASE}${file.split("/").map(encodeURIComponent).join("/")}`;
}

/** The conventional photo path of a card, for when the manifest isn't at hand. */
export function defaultPhotoFile(source: string, card: string): string {
  return `photos/${source}/${card}.jpg`;
}

// ── Directory resolution ───────────────────────────────────────────────

export function archiveDirCandidates(env: NodeJS.ProcessEnv = process.env): string[] {
  const here = fileURLToPath(new URL(".", import.meta.url));
  const out: string[] = [];
  const override = env[ARCHIVE_DIR_ENV];
  if (override) out.push(resolve(override));
  out.push(
    resolve(here, "../../../../quiz-archive"),
    resolve(here, "../../quiz-archive"),
    resolve(process.cwd(), "packages/quiz-archive"),
    resolve(process.cwd(), "../quiz-archive"),
  );
  return out;
}

/** The first candidate holding a `manifest/` dir; null when there is no archive. */
export function resolveArchiveDir(env: NodeJS.ProcessEnv = process.env): string | null {
  for (const dir of archiveDirCandidates(env)) {
    if (existsSync(join(dir, "manifest"))) return dir;
  }
  return null;
}

// ── File shapes (read leniently: only what the desk shows) ─────────────

const ManifestEntrySchema = z.object({
  card: z.string(),
  file: z.string(),
  originalName: z.string(),
  sha256Stored: z.string(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  takenAt: z.string().nullable().optional(),
  rotate: z.number().int().optional(),
  duplicates: z.array(z.object({ file: z.string() })).optional(),
});
const ManifestSchema = z.object({ source: z.string(), cards: z.array(ManifestEntrySchema) });

const LooseSource = SourceLinkSchema.nullable().optional().catch(null);
const str = z.string().optional().catch(undefined);

/** Trivial Pursuit / Publish or Perish: one question per category. */
const FlatTranscriptSchema = z.object({
  questions: z.array(
    z.object({
      category: z.number().int(),
      cardDe: str,
      cardText: str,
      de: z.string(),
      en: z.string(),
      reworked: z.boolean().optional().catch(undefined),
      answerDe: z.string(),
      answerEn: z.string(),
      notes: str,
      discipline: str,
      source: LooseSource,
    }),
  ),
});

/** Quiztopia: one set per category, the printed question marked `original`. */
const SetsTranscriptSchema = z.object({
  sets: z.array(
    z.object({
      n: z.number().int(),
      notes: str,
      notes_internal: str,
      questions: z.array(
        z.object({
          original: z.boolean().optional(),
          de: z.string(),
          en: z.string(),
          answer_de: z.string(),
          answer_en: z.string(),
          source: LooseSource,
        }),
      ),
    }),
  ),
});

const TranscriptFileSchema = z.union([FlatTranscriptSchema, SetsTranscriptSchema]);
type TranscriptFile = z.infer<typeof TranscriptFileSchema>;

const RunSchema = z.object({ title: z.string().optional() });

/** The transcription of one category slot of a card, normalised; null when absent. */
export function transcriptExcerpt(
  file: TranscriptFile,
  category: number,
): QuizDeskTranscript | null {
  if ("questions" in file) {
    const q = file.questions.find((x) => x.category === category);
    if (!q) return null;
    return {
      category,
      cardDe: q.cardDe ?? null,
      cardText: q.cardText ?? null,
      question: { en: q.en, de: q.de },
      answer: { en: q.answerEn, de: q.answerDe },
      notes: q.notes || null,
      reworked: q.reworked ?? null,
      discipline: q.discipline ?? null,
      source: q.source ?? null,
    };
  }
  const set = file.sets.find((s) => s.n === category);
  const q = set?.questions.find((x) => x.original) ?? set?.questions[0];
  if (!set || !q) return null;
  const notes = [set.notes_internal, set.notes].filter((n): n is string => !!n?.trim());
  return {
    category,
    cardDe: q.de,
    cardText: null,
    question: { en: q.en, de: q.de },
    answer: { en: q.answer_en, de: q.answer_de },
    notes: notes.length > 0 ? notes.join("\n\n") : null,
    reworked: null,
    discipline: null,
    source: q.source ?? null,
  };
}

// ── Store ──────────────────────────────────────────────────────────────

export interface ArchiveStore {
  /** The archive directory; null when there is none (nothing is ever found). */
  readonly dir: string | null;
  photo(source: string, card: string): Promise<QuizDeskPhotoManifest | null>;
  transcript(source: string, card: string, category: number): Promise<QuizDeskTranscript | null>;
  runTitle(run: string): Promise<string | null>;
}

const SAFE_SEGMENT = /^[a-z0-9][a-z0-9.-]{0,63}$/;

async function readJsonOrNull(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    // Missing, unreadable or not JSON: the desk shows the card without it.
    return null;
  }
}

export function loadArchiveStore(dir: string | null = resolveArchiveDir()): ArchiveStore {
  const manifests = new Map<string, Promise<Map<string, QuizDeskPhotoManifest> | null>>();
  const transcripts = new Map<string, Promise<TranscriptFile | null>>();
  const runs = new Map<string, Promise<string | null>>();

  const manifest = (source: string) => {
    let pending = manifests.get(source);
    if (!pending) {
      pending = (async () => {
        if (!dir) return null;
        const parsed = ManifestSchema.safeParse(
          await readJsonOrNull(join(dir, "manifest", `${source}.json`)),
        );
        if (!parsed.success) return null;
        return new Map(
          parsed.data.cards.map((c) => [
            c.card,
            {
              file: c.file,
              originalName: c.originalName,
              rotate: c.rotate ?? 0,
              takenAt: c.takenAt ?? null,
              sha256Stored: c.sha256Stored,
              width: c.width ?? null,
              height: c.height ?? null,
              duplicates: (c.duplicates ?? []).map((d) => photoUrl(d.file)),
            },
          ]),
        );
      })();
      manifests.set(source, pending);
    }
    return pending;
  };

  const transcriptFile = (source: string, card: string) => {
    const key = `${source}/${card}`;
    const cached = transcripts.get(key);
    if (cached) return cached;
    const pending = (async () => {
      if (!dir) return null;
      const parsed = TranscriptFileSchema.safeParse(
        await readJsonOrNull(join(dir, "transcripts", source, `${card}.json`)),
      );
      return parsed.success ? parsed.data : null;
    })();
    transcripts.set(key, pending);
    while (transcripts.size > TRANSCRIPT_CACHE_SIZE) {
      const oldest = transcripts.keys().next().value;
      if (oldest === undefined) break;
      transcripts.delete(oldest);
    }
    return pending;
  };

  return {
    dir,
    photo: async (source, card) => {
      if (!SAFE_SEGMENT.test(source) || !SAFE_SEGMENT.test(card)) return null;
      return (await manifest(source))?.get(card) ?? null;
    },
    transcript: async (source, card, category) => {
      if (!SAFE_SEGMENT.test(source) || !SAFE_SEGMENT.test(card)) return null;
      const file = await transcriptFile(source, card);
      return file ? transcriptExcerpt(file, category) : null;
    },
    runTitle: (run) => {
      if (!SAFE_SEGMENT.test(run)) return Promise.resolve(null);
      let pending = runs.get(run);
      if (!pending) {
        pending = (async () => {
          if (!dir) return null;
          const parsed = RunSchema.safeParse(
            await readJsonOrNull(join(dir, "runs", run, "run.json")),
          );
          return parsed.success ? (parsed.data.title ?? null) : null;
        })();
        runs.set(run, pending);
      }
      return pending;
    },
  };
}

// ── Process-wide instance ──────────────────────────────────────────────

let current: ArchiveStore | null = null;

export function getArchiveStore(): ArchiveStore {
  if (!current) current = loadArchiveStore();
  return current;
}

/** Test seam: install a fixture archive (or `null` to force a reload). */
export function __setArchiveStore(store: ArchiveStore | null): void {
  current = store;
}
