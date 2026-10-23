// Runs: `packages/quiz-archive/runs/<run-id>/run.json` (see
// packages/quiz-archive/RUNS.md). `run open` writes the skeleton when a batch
// starts; `run close` stamps its end and the history entries it wrote.
// QUIZ_ARCHIVE_DIR overrides the archive folder (tests).

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { RunIdSchema } from "../../../packages/core/src/quiz/history-schema.ts";
import { writeFileAtomic } from "./content-io.ts";

export const ARCHIVE_DIR =
  process.env.QUIZ_ARCHIVE_DIR ??
  new URL("../../../packages/quiz-archive/", import.meta.url).pathname;

/** RUNS.md's kinds, plus the provenance platform's own. */
export const RUN_KINDS = [
  "ingest",
  "enrich",
  "research",
  "rebalance",
  "rework",
  "dedupe",
  "split",
  "import",
  "tagging",
  "evidence",
  "backlog",
  "retire",
  "seal",
  "other",
] as const;
export type RunKind = (typeof RUN_KINDS)[number];

export interface RunFile {
  id: string;
  title: string;
  startedAt: string;
  endedAt: string | null;
  kind: string;
  by: string[];
  brief: string;
  inputs: string[];
  outputs: string[];
  archivedFrom: string[];
  archivedAt: string | null;
  counts: Record<string, unknown>;
  notes: string;
  [extra: string]: unknown;
}

export const runPath = (id: string, archiveDir = ARCHIVE_DIR) =>
  join(archiveDir, "runs", id, "run.json");

export function readRun(id: string, archiveDir = ARCHIVE_DIR): RunFile | undefined {
  const p = runPath(id, archiveDir);
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as RunFile) : undefined;
}

export function runExists(id: string, archiveDir = ARCHIVE_DIR): boolean {
  return existsSync(runPath(id, archiveDir));
}

const writeRun = (run: RunFile, archiveDir: string) =>
  writeFileAtomic(runPath(run.id, archiveDir), `${JSON.stringify(run, null, 1)}\n`);

export function openRun(
  id: string,
  opts: { title: string; kind: string; by: string[]; at: string; brief?: string },
  archiveDir = ARCHIVE_DIR,
): RunFile {
  if (!RunIdSchema.safeParse(id).success) throw new Error(`bad run id ${id} (a-z, 0-9, . and -)`);
  if (!(RUN_KINDS as readonly string[]).includes(opts.kind))
    throw new Error(`unknown run kind ${opts.kind} (${RUN_KINDS.join("|")})`);
  if (!opts.title.trim()) throw new Error("--title is required");
  if (runExists(id, archiveDir)) throw new Error(`run ${id} already exists`);
  const run: RunFile = {
    id,
    title: opts.title,
    startedAt: opts.at,
    endedAt: null,
    kind: opts.kind,
    by: opts.by,
    brief: opts.brief ?? "",
    inputs: [],
    outputs: [],
    archivedFrom: [],
    archivedAt: null,
    counts: {},
    notes: "",
  };
  writeRun(run, archiveDir);
  return run;
}

export function closeRun(
  id: string,
  opts: { at: string; historyEntries?: number },
  archiveDir = ARCHIVE_DIR,
): RunFile {
  const run = readRun(id, archiveDir);
  if (!run) throw new Error(`no run ${id} (quiz-ingest run open ${id} …)`);
  if (run.endedAt) throw new Error(`run ${id} already closed at ${run.endedAt}`);
  const next: RunFile = {
    ...run,
    endedAt: opts.at,
    counts: {
      ...run.counts,
      ...(opts.historyEntries !== undefined ? { historyEntries: opts.historyEntries } : {}),
    },
  };
  writeRun(next, archiveDir);
  return next;
}
