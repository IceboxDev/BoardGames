// A throwaway copy of the fixture bank with retired facts and a history file,
// for the tests of retirement and the article history:
//   - f00001 (printed on c001, slot 1) retired as a duplicate of f00002;
//   - f00061 (printed on c002, slot 1) retired with nothing replacing it;
//   - `history/a0001.json` with a few entries (a0002 has no history file).

import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURE_DIR = fileURLToPath(new URL("./content/", import.meta.url));

type Json = Record<string, unknown>;

function readJson(path: string): Json {
  return JSON.parse(readFileSync(path, "utf8")) as Json;
}

function retire(dir: string, articleId: string, factId: string, replacedBy?: string[]): void {
  const path = join(dir, "articles", `${articleId}.json`);
  const article = readJson(path);
  const facts = article.facts as Json[];
  const fact = facts.find((f) => f.id === factId);
  if (!fact) throw new Error(`fixture: no ${factId} in ${articleId}`);
  const { spans: _spans, ...rest } = fact;
  article.facts = facts.filter((f) => f !== fact);
  article.retired = [
    {
      ...rest,
      retired: {
        at: "2026-10-21",
        reason: replacedBy ? `Duplicate of ${replacedBy.join(", ")}.` : "The premise is wrong.",
        ...(replacedBy ? { replacedBy } : {}),
      },
    },
  ];
  writeFileSync(path, JSON.stringify(article));

  const indexPath = join(dir, "index.json");
  const index = readJson(indexPath);
  for (const entry of index.articles as Json[]) {
    if (entry.id === articleId) entry.factIds = (entry.factIds as string[]).filter((id) => id !== factId);
  }
  writeFileSync(indexPath, JSON.stringify(index));
}

export const FIXTURE_HISTORY = {
  article: "a0001",
  entries: [
    {
      seq: 1,
      at: "2026-09-17",
      kind: "printed",
      target: { type: "wording", id: "w00001" },
      reason: "Transcribed from Quiztopia card c001.",
      by: "transcription",
    },
    {
      seq: 2,
      at: "2026-10-20",
      kind: "corrected",
      target: { type: "article", id: "a0001" },
      reason: "The anthem's year was wrong.",
      by: "owner",
      sources: [{ url: "https://en.wikipedia.org/wiki/Kinderhymne", title: "Kinderhymne" }],
      changes: [{ field: "bodyEn", diff: [["=", 4], ["-", "1949"], ["+", "1950"]] }],
    },
    {
      seq: 3,
      at: "2026-10-21",
      kind: "retired",
      target: { type: "fact", id: "f00001" },
      reason: "Duplicate of f00002.",
      by: "coordinator",
      changes: [{ field: "retired", new: { at: "2026-10-21" } }],
    },
  ],
};

/** Builds the bank in a fresh temp dir; call the returned `cleanup` when done. */
export function makeRetiredBank(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "quiz-retired-"));
  cpSync(FIXTURE_DIR, dir, { recursive: true });
  retire(dir, "a0001", "f00001", ["f00002"]);
  retire(dir, "a0013", "f00061");
  const metaPath = join(dir, "meta.json");
  const meta = readJson(metaPath);
  const counts = meta.counts as Json;
  counts.facts = (counts.facts as number) - 2;
  counts.retired = 2;
  writeFileSync(metaPath, JSON.stringify(meta));
  const historyDir = join(dir, "history");
  mkdirSync(historyDir);
  writeFileSync(join(historyDir, "a0001.json"), JSON.stringify(FIXTURE_HISTORY));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

// ── The quiz desk's bank ────────────────────────────────────────────────
//
// `makeRetiredBank` plus everything the admin desk reads:
//   - f00061's retirement gets the code "wrong" (f00001 keeps none);
//   - a retired generated wording (w90001) on a0002's f00006, code
//     "superseded-by-print";
//   - a0024 (printed on c002, slot 12) retired as a whole, merged into a0023;
//   - `evidence/a0001.json`: f00002 confirmed verbatim by two independent
//     sources, one official (grade A); f00003 by one (grade C);
//   - `backlog.jsonl` (four items, one on the retired article), `tags.json`
//     (the real registry) and a run named in a0001's history;
//   - an archive dir beside the bank: c001's manifest entry, its transcript
//     (the real one) and `runs/tp-221/run.json`.

const CORE_CONTENT = fileURLToPath(new URL("../../../../../core/src/quiz/content/", import.meta.url));
const CORE_ARCHIVE = fileURLToPath(new URL("../../../../../quiz-archive/", import.meta.url));

export const DESK_EVIDENCE = {
  article: "a0001",
  sources: {
    s1: {
      url: "https://de.wikipedia.org/wiki/Kinderhymne",
      title: "Kinderhymne – Wikipedia",
      kind: "encyclopedia",
      lang: "de",
      retrievedAt: "2026-10-23",
      snapshot: "a".repeat(64),
    },
    s2: {
      url: "https://www.bundesregierung.de/hymne",
      kind: "official",
      lang: "de",
      retrievedAt: "2026-10-23",
      snapshot: "b".repeat(64),
    },
    s3: {
      url: "https://www.wikiwand.com/de/Kinderhymne",
      kind: "encyclopedia",
      lang: "de",
      retrievedAt: "2026-10-23",
    },
  },
  assessments: [
    {
      id: "e1",
      at: "2026-10-23",
      target: "f00002",
      claim: "answer",
      verdict: "confirmed",
      confidence: "high",
      support: [
        { source: "s1", quote: "Hoffmann von Fallersleben", quoteLang: "de", verbatim: true },
        { source: "s2", quote: "Hoffmann von Fallersleben", quoteLang: "de", verbatim: true },
      ],
      by: "crawler",
      run: "evidence-crawl",
    },
    {
      id: "e2",
      at: "2026-10-23",
      target: "f00003",
      claim: "answer",
      verdict: "confirmed",
      confidence: "medium",
      support: [{ source: "s1", quote: "Joseph Haydn", quoteLang: "de", verbatim: true }],
      by: "crawler",
    },
  ],
};

export const DESK_BACKLOG = [
  {
    id: "b00001",
    kind: "photo-check",
    target: "quiztopia/c001",
    priority: 2,
    status: "open",
    created: "2026-10-22",
    by: "coordinator",
    notes: "Check slot 1 against the photo.",
    links: [],
  },
  {
    id: "b00002",
    kind: "verify",
    target: "f00002",
    priority: 3,
    status: "done",
    created: "2026-10-21",
    by: "coordinator",
    run: "handcheck-2026-10-23",
    notes: "",
    links: [],
    closedBy: "a0001#2",
    closedAt: "2026-10-23",
  },
  {
    id: "b00003",
    kind: "idea",
    target: "domain:history",
    priority: 4,
    status: "open",
    created: "2026-10-23",
    by: "owner",
    notes: "More on the Hanseatic League.",
    links: [],
  },
  {
    id: "b00004",
    kind: "research",
    target: "a0024",
    priority: 1,
    status: "open",
    created: "2026-10-23",
    by: "owner",
    notes: "Restore once rewritten?",
    links: [],
  },
];

function editArticle(dir: string, id: string, edit: (a: Json) => void): void {
  const path = join(dir, "articles", `${id}.json`);
  const article = readJson(path);
  edit(article);
  writeFileSync(path, JSON.stringify(article));
}

/** Builds the desk bank (and its archive) in a fresh temp dir; call `cleanup` when done. */
export function makeDeskBank(): { dir: string; archiveDir: string; cleanup: () => void } {
  const bank = makeRetiredBank();
  const { dir } = bank;

  editArticle(dir, "a0013", (a) => {
    for (const f of a.retired as Json[]) (f.retired as Json).code = "wrong";
  });
  editArticle(dir, "a0002", (a) => {
    const fact = (a.facts as Json[])[0];
    fact.retiredWordings = [
      {
        id: "w90001",
        en: "Which number answers everything?",
        de: "Welche Zahl beantwortet alles?",
        origin: "generated",
        retired: {
          at: "2026-10-20",
          code: "superseded-by-print",
          reason: "Quiztopia prints the question.",
          replacedBy: ["w00006"],
        },
      },
    ];
  });
  let retiredFacts = 0;
  editArticle(dir, "a0024", (a) => {
    retiredFacts = (a.facts as Json[]).length;
    a.articleRetired = {
      at: "2026-10-22",
      code: "merged",
      reason: "Merged into a0023.",
      replacedBy: ["a0023"],
    };
  });
  const metaPath = join(dir, "meta.json");
  const meta = readJson(metaPath);
  const counts = meta.counts as Json;
  counts.articles = (counts.articles as number) - 1;
  counts.facts = (counts.facts as number) - retiredFacts;
  counts.retiredArticles = 1;
  writeFileSync(metaPath, JSON.stringify(meta));

  mkdirSync(join(dir, "evidence"));
  writeFileSync(join(dir, "evidence", "a0001.json"), JSON.stringify(DESK_EVIDENCE));
  writeFileSync(
    join(dir, "backlog.jsonl"),
    DESK_BACKLOG.map((b) => `${JSON.stringify(b)}\n`).join(""),
  );
  cpSync(join(CORE_CONTENT, "tags.json"), join(dir, "tags.json"));
  writeFileSync(
    join(dir, "history", "a0001.json"),
    JSON.stringify({
      ...FIXTURE_HISTORY,
      entries: [
        ...FIXTURE_HISTORY.entries,
        {
          seq: 4,
          at: "2026-10-23",
          kind: "edited",
          target: { type: "fact", id: "f00002" },
          reason: "Card 221 merge.",
          by: "coordinator",
          run: "tp-221",
        },
      ],
    }),
  );

  const archiveDir = mkdtempSync(join(tmpdir(), "quiz-archive-"));
  mkdirSync(join(archiveDir, "manifest"));
  mkdirSync(join(archiveDir, "transcripts", "quiztopia"), { recursive: true });
  mkdirSync(join(archiveDir, "runs", "tp-221"), { recursive: true });
  writeFileSync(
    join(archiveDir, "manifest", "quiztopia.json"),
    JSON.stringify({
      source: "quiztopia",
      cards: [
        {
          card: "c001",
          file: "photos/quiztopia/c001.jpg",
          originalName: "IMG20260910164837.jpg",
          sha256Original: "1".repeat(64),
          sha256Stored: "2".repeat(64),
          bytes: 6413611,
          width: 2290,
          height: 3150,
          takenAt: "2026-09-10T16:48:37+02:00",
          device: "OPPO Find X9 Ultra",
          rotate: 270,
          duplicates: [
            {
              file: "photos/quiztopia/c001.dup1.jpg",
              originalName: "IMG20260914174349.jpg",
              sha256Original: "3".repeat(64),
              sha256Stored: "4".repeat(64),
            },
          ],
        },
      ],
    }),
  );
  cpSync(
    join(CORE_ARCHIVE, "transcripts", "quiztopia", "c001.json"),
    join(archiveDir, "transcripts", "quiztopia", "c001.json"),
  );
  writeFileSync(
    join(archiveDir, "runs", "tp-221", "run.json"),
    JSON.stringify({ id: "tp-221", title: "Trivial Pursuit card 221" }),
  );

  return {
    dir,
    archiveDir,
    cleanup: () => {
      bank.cleanup();
      rmSync(archiveDir, { recursive: true, force: true });
    },
  };
}
