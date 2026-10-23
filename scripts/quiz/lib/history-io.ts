// Reading, writing and recording the quiz bank's changelog under
// packages/core/src/quiz/content/history/ (see core `quiz/history.ts`).
//
// Recording works against the git index: the index holds each article (and
// each source's card file) as it was when last logged, so `logChanges` diffs
// the working file against it, writes one entry per changed entity (with the
// editor's kind, reason and evidence), and stages the file and its history —
// the next log then sees only what changed after this one. Nothing is
// committed.
//
// Every entry written here is chained (`chain`, core `entryChain`) onto the
// file's last link, so each file is a tamper-evident hash chain from its
// first chained entry on. A move takes an entity's entries out of one file
// and into another: the moved entries keep where they were first written
// (`movedFrom: {article, seq}`) and are re-linked in their new file, and the
// file they left is re-linked from its first chained entry. A file whose
// chain is already broken is never written to.
//
// Card files (`history/cards/<source>.json`) track each printed card's photo
// and slots (`cardFields`); a card is logged when it differs from its last
// hashed entry, or — before it has one — from the source file in the index.
// A source file the index has never held is tracked from the seal on.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import {
  type Article,
  ArticleSchema,
  type SourceCards,
  SourceCardsSchema,
} from "../../../packages/core/src/quiz/content-types.ts";
import {
  type ArticleHistory,
  ArticleHistorySchema,
  articleEntities,
  type CardHistory,
  CardHistorySchema,
  CONFIDENCES,
  type Confidence,
  cardEntities,
  chainEntry,
  chainProblems,
  checkpointEntries,
  type Entity,
  type EntityFields,
  entityHash,
  fieldChanges,
  HISTORY_KINDS,
  type HistoryActor,
  type HistoryChange,
  type HistoryEntry,
  type HistoryKind,
  historyRoot,
  lastChain,
  RunIdSchema,
  serializeHistory,
} from "../../../packages/core/src/quiz/history.ts";
import { CONTENT_DIR, writeFileAtomic } from "./content-io.ts";

export const HISTORY_DIR = join(CONTENT_DIR, "history");
const REPO_ROOT = new URL("../../../", import.meta.url).pathname;

// ── Where the files are, and the last logged state ───────────────────────

/**
 * The bank's files and their previous (last logged) state. The default reads
 * the git index and stages with `git add`; tests use a temp dir and a map.
 */
export interface HistoryStore {
  /** The content dir (holding articles/, sources/, history/). */
  contentDir: string;
  /** A content file as last logged, by path relative to `contentDir`; null when never. */
  previous(rel: string): string | null;
  /** Mark these absolute paths as logged. */
  stage(paths: readonly string[]): void;
}

function gitShowIndex(path: string): string | null {
  try {
    return execFileSync("git", ["show", `:${relative(REPO_ROOT, path)}`], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

export function stage(paths: readonly string[]): void {
  for (let i = 0; i < paths.length; i += 200) {
    execFileSync(
      "git",
      ["add", "--", ...paths.slice(i, i + 200).map((p) => relative(REPO_ROOT, p))],
      {
        cwd: REPO_ROOT,
        stdio: "ignore",
      },
    );
  }
}

export const GIT_STORE: HistoryStore = {
  contentDir: CONTENT_DIR,
  previous: (rel) => gitShowIndex(join(CONTENT_DIR, rel)),
  stage,
};

const historyDir = (store: HistoryStore) => join(store.contentDir, "history");

export function historyPath(articleId: string, store: HistoryStore = GIT_STORE): string {
  return join(historyDir(store), `${articleId}.json`);
}

export function cardHistoryPath(source: string, store: HistoryStore = GIT_STORE): string {
  return join(historyDir(store), "cards", `${source}.json`);
}

export function readHistory(
  articleId: string,
  store: HistoryStore = GIT_STORE,
): ArticleHistory | undefined {
  const p = historyPath(articleId, store);
  if (!existsSync(p)) return undefined;
  return ArticleHistorySchema.parse(JSON.parse(readFileSync(p, "utf8")));
}

export function readHistories(store: HistoryStore = GIT_STORE): Map<string, ArticleHistory> {
  const out = new Map<string, ArticleHistory>();
  const dir = historyDir(store);
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const h = ArticleHistorySchema.parse(JSON.parse(readFileSync(join(dir, f), "utf8")));
    out.set(h.article, h);
  }
  return out;
}

export function writeHistory(h: ArticleHistory, store: HistoryStore = GIT_STORE): void {
  mkdirSync(historyDir(store), { recursive: true });
  writeFileAtomic(historyPath(h.article, store), serializeHistory(ArticleHistorySchema.parse(h)));
}

export function readCardHistories(store: HistoryStore = GIT_STORE): Map<string, CardHistory> {
  const out = new Map<string, CardHistory>();
  const dir = join(historyDir(store), "cards");
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const h = CardHistorySchema.parse(JSON.parse(readFileSync(join(dir, f), "utf8")));
    out.set(h.source, h);
  }
  return out;
}

export function writeCardHistory(h: CardHistory, store: HistoryStore = GIT_STORE): void {
  writeFileAtomic(cardHistoryPath(h.source, store), serializeHistory(CardHistorySchema.parse(h)));
}

/** Every history file's seqs by key (`a0042`, `cards/quiztopia`), for backlog `closedBy` checks. */
export function historySeqs(store: HistoryStore = GIT_STORE): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>();
  for (const h of readHistories(store).values())
    out.set(h.article, new Set(h.entries.map((e) => e.seq)));
  for (const h of readCardHistories(store).values())
    out.set(`cards/${h.source}`, new Set(h.entries.map((e) => e.seq)));
  return out;
}

function readSources(store: HistoryStore): SourceCards[] {
  const dir = join(store.contentDir, "sources");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => SourceCardsSchema.parse(JSON.parse(readFileSync(join(dir, f), "utf8"))));
}

/** The article as last logged (its staged version), or null when never staged. */
export function loggedArticle(articleId: string, store: HistoryStore = GIT_STORE): Article | null {
  const raw = store.previous(join("articles", `${articleId}.json`));
  if (!raw) return null;
  const r = ArticleSchema.safeParse(JSON.parse(raw));
  return r.success ? r.data : null;
}

/** A source's cards as last logged, or null when never staged. */
export function loggedSource(source: string, store: HistoryStore = GIT_STORE): SourceCards | null {
  const raw = store.previous(join("sources", `${source}.json`));
  if (!raw) return null;
  const r = SourceCardsSchema.safeParse(JSON.parse(raw));
  return r.success ? r.data : null;
}

// ── Reasons ──────────────────────────────────────────────────────────────

/** Why an entity changed, as the editor states it. */
export interface Reason {
  kind: HistoryKind;
  reason: string;
  sources?: { url: string; title?: string }[];
  ref?: string;
  /** Only these fields (the entity's other changes need another reason). */
  fields?: string[];
  /** How sure the author is of the change. */
  confidence?: Confidence;
  /** Evidence-ledger assessments behind it: `e12` (this article's) or `a0042/e12`. */
  evidence?: string[];
  /** The member report (`quiz_reports` id) it answers. */
  report?: string;
  /** The run it belongs to, when not the log's `--run`. */
  run?: string;
}

/**
 * The reasons file: entity id → one reason or several (split by `fields`),
 * plus an optional `default` for every changed article, fact or wording not
 * named. Cards are keyed `<source>/<card>` (or the bare card id) and never
 * take the default.
 */
export type ReasonsFile = Record<string, Reason | Reason[]>;

const EVIDENCE_REF_RE = /^(?:a\d{4,}\/)?e\d+$/;

export function parseReasons(raw: unknown): ReasonsFile {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("reasons file must be a JSON object");
  const out: ReasonsFile = {};
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    const list = Array.isArray(v) ? v : [v];
    for (const r of list as Reason[]) {
      if (!r || typeof r !== "object") throw new Error(`${id}: a reason must be an object`);
      if (!HISTORY_KINDS.includes(r.kind)) throw new Error(`${id}: unknown kind ${r.kind}`);
      if (typeof r.reason !== "string" || !r.reason.trim()) throw new Error(`${id}: empty reason`);
      if (r.confidence !== undefined && !CONFIDENCES.includes(r.confidence))
        throw new Error(`${id}: confidence must be one of ${CONFIDENCES.join("|")}`);
      if (
        r.evidence !== undefined &&
        (!Array.isArray(r.evidence) || !r.evidence.every((e) => EVIDENCE_REF_RE.test(e)))
      )
        throw new Error(`${id}: evidence must be a list of e12 / a0042/e12 ids`);
      if (r.report !== undefined && (typeof r.report !== "string" || !r.report.trim()))
        throw new Error(`${id}: empty report id`);
      if (r.run !== undefined && !RunIdSchema.safeParse(r.run).success)
        throw new Error(`${id}: bad run id ${r.run}`);
    }
    out[id] = list as Reason[];
  }
  return out;
}

// ── Chained writing ──────────────────────────────────────────────────────

/** An entry before it is placed: `seq` and `chain` are set when it's appended. */
export type EntryDraft = Omit<HistoryEntry, "seq" | "chain">;

/** Append `draft` to `entries` with the next seq, chained onto the file's last link. */
export function pushChained(entries: HistoryEntry[], draft: EntryDraft): HistoryEntry {
  const { chain: _c, seq: _s, ...clean } = draft as HistoryEntry;
  const seq = (entries.at(-1)?.seq ?? 0) + 1;
  const entry = chainEntry(lastChain(entries), { ...clean, seq } as HistoryEntry);
  entries.push(entry);
  return entry;
}

/** Re-link a file's chain from its first chained entry (after entries were taken out of it). */
export function relink(entries: HistoryEntry[]): void {
  const first = entries.findIndex((e) => e.chain);
  if (first < 0) return;
  let prev: string | null = null;
  for (let i = first; i < entries.length; i++) {
    entries[i] = chainEntry(prev, entries[i]);
    prev = entries[i].chain ?? null;
  }
}

// ── Recording ────────────────────────────────────────────────────────────

export interface LogOptions {
  reasons: ReasonsFile;
  by: string;
  at: string;
  /** Structured author, stored on every entry. */
  actor?: HistoryActor;
  /** The run every entry belongs to (a reason may name its own). */
  run?: string;
  /** Articles to consider (default: all). */
  ids?: readonly string[];
  /** Also log printed cards (default: only when `ids` is not given). */
  cards?: boolean;
  /** The sources to diff (default: read from the store). */
  sources?: readonly SourceCards[];
  /** Entries to write first, per article, when the log goes ahead (an article's retirement). */
  prepend?: Record<string, EntryDraft[]>;
  /** Write nothing; report what would be logged. */
  dryRun?: boolean;
  store?: HistoryStore;
}

export interface LogResult {
  entries: number;
  articles: string[];
  /** Sources whose card history was written. */
  cards: string[];
  /** Changed entities with no reason (nothing is written when there are any). */
  unexplained: string[];
}

const lastEntry = (entries: readonly HistoryEntry[] | undefined, id: string) =>
  entries ? [...entries].reverse().find((e) => e.target.id === id) : undefined;

const lastHashed = (entries: readonly HistoryEntry[] | undefined, id: string) =>
  entries ? [...entries].reverse().find((e) => e.target.id === id && e.hash) : undefined;

/** A history file key: `aNNNN` or `cards/<source>`. */
type FileKey = string;

interface Pending {
  file: FileKey;
  entity: Entity;
  changes: HistoryChange[];
  /** The article whose history held the entity before it moved here. */
  movedFrom?: string;
  /** Reason keys to look up, in order. */
  keys: string[];
  /** Whether `reasons.default` applies. */
  takesDefault: boolean;
}

/**
 * Log every entity whose content differs from its latest history entry.
 * Facts that moved bring their entries along (from the article that logged
 * them) before the move itself is recorded.
 */
export function logChanges(articles: readonly Article[], opts: LogOptions): LogResult {
  const store = opts.store ?? GIT_STORE;
  const histories = readHistories(store);
  const cardHistories = readCardHistories(store);
  const scope = opts.ids ? articles.filter((a) => opts.ids?.includes(a.id)) : articles;
  const home = new Map<string, string>(); // entity id → article whose history holds it
  for (const h of histories.values()) for (const e of h.entries) home.set(e.target.id, h.article);

  const pending: Pending[] = [];
  for (const a of scope) {
    const h = histories.get(a.id);
    let prev: Article | null | undefined;
    for (const ent of articleEntities(a)) {
      const last = lastEntry(h?.entries, ent.id);
      const hash = entityHash(ent.fields);
      const from = home.get(ent.id);
      const movedFrom = from && from !== a.id ? from : undefined;
      if (last?.hash === hash && !movedFrom) continue;
      if (prev === undefined) prev = loggedArticle(a.id, store);
      let prevFields =
        prev && articleEntities(prev).find((e) => e.id === ent.id && e.type === ent.type)?.fields;
      if (!prevFields && movedFrom) {
        const old = loggedArticle(movedFrom, store);
        prevFields = old ? articleEntities(old).find((e) => e.id === ent.id)?.fields : undefined;
      }
      const changes = fieldChanges(prevFields ?? null, ent.fields);
      if (changes.length === 0 && last?.hash === hash && !movedFrom) continue;
      pending.push({
        file: a.id,
        entity: ent,
        changes,
        keys: [ent.id],
        takesDefault: true,
        ...(movedFrom ? { movedFrom } : {}),
      });
    }
  }

  if (opts.cards ?? !opts.ids) {
    for (const s of opts.sources ?? readSources(store)) {
      const entries = cardHistories.get(s.source)?.entries;
      let prev: SourceCards | null | undefined;
      for (const ent of cardEntities(s)) {
        const hash = entityHash(ent.fields);
        const last = lastHashed(entries, ent.id);
        if (last?.hash === hash) continue;
        if (prev === undefined) prev = loggedSource(s.source, store);
        const prevCard = prev?.cards.find((c) => c.id === ent.id);
        const prevFields: EntityFields | null = prevCard
          ? { image: prevCard.image, slots: prevCard.slots }
          : null;
        // Before its first entry, a card is tracked against the last logged source
        // file; a source never logged at all is tracked from the seal on (or from
        // a reason that names the card).
        if (!last && prevFields && entityHash(prevFields) === hash) continue;
        const keys = [`${s.source}/${ent.id}`, ent.id];
        if (!last && !prev && !keys.some((k) => opts.reasons[k])) continue;
        pending.push({
          file: `cards/${s.source}`,
          entity: ent,
          changes: fieldChanges(prevFields, ent.fields),
          keys,
          takesDefault: false,
        });
      }
    }
  }

  const unexplained: string[] = [];
  const planned: { file: FileKey; entry: EntryDraft; moveFrom?: string }[] = [];
  for (const p of pending) {
    const named = p.keys.map((k) => opts.reasons[k]).find((r) => r !== undefined);
    const given = named ?? (p.takesDefault ? opts.reasons.default : undefined);
    const list = given ? (Array.isArray(given) ? given : [given]) : [];
    const label = p.file.startsWith("cards/") ? p.keys[0] : p.entity.id;
    if (list.length === 0) {
      unexplained.push(`${label} (${p.changes.map((c) => c.field).join(", ") || "moved"})`);
      continue;
    }
    const base = (run?: string): Pick<EntryDraft, "at" | "by" | "actor" | "run"> => ({
      at: opts.at,
      by: opts.by,
      ...(opts.actor ? { actor: opts.actor } : {}),
      ...((run ?? opts.run) ? { run: run ?? opts.run } : {}),
    });
    let rest = p.changes;
    const out: EntryDraft[] = [];
    if (p.movedFrom) {
      out.push({
        ...base(),
        kind: "moved",
        target: { type: p.entity.type, id: p.entity.id },
        reason: `Moved from ${p.movedFrom} to ${p.file}.`,
      });
    }
    list.forEach((r, i) => {
      const mine = r.fields ? rest.filter((c) => r.fields?.includes(c.field)) : rest;
      if (r.fields) rest = rest.filter((c) => !r.fields?.includes(c.field));
      else rest = [];
      if (mine.length === 0 && r.fields && i < list.length - 1) return;
      out.push({
        ...base(r.run),
        kind: r.kind,
        target: { type: p.entity.type, id: p.entity.id },
        reason: r.reason,
        ...(r.ref ? { ref: r.ref } : {}),
        ...(r.sources?.length ? { sources: r.sources } : {}),
        ...(mine.length ? { changes: mine } : {}),
        ...(r.evidence?.length ? { evidence: r.evidence } : {}),
        ...(r.confidence ? { confidence: r.confidence } : {}),
        ...(r.report ? { report: r.report } : {}),
      });
    });
    if (rest.length > 0) {
      unexplained.push(`${label} (${rest.map((c) => c.field).join(", ")} not covered)`);
      continue;
    }
    if (out.length === 0) continue;
    out[out.length - 1].hash = entityHash(p.entity.fields);
    for (const entry of out) {
      planned.push({ file: p.file, entry, ...(p.movedFrom ? { moveFrom: p.movedFrom } : {}) });
    }
  }
  const prepend = Object.entries(opts.prepend ?? {}).filter(([, list]) => list.length > 0);
  const total = planned.length + prepend.reduce((n, [, l]) => n + l.length, 0);
  const files = [...new Set([...prepend.map(([aid]) => aid), ...planned.map((x) => x.file)])];
  const summary = (written: FileKey[]): LogResult => ({
    entries: total,
    articles: written.filter((k) => !k.startsWith("cards/")),
    cards: written.filter((k) => k.startsWith("cards/")).map((k) => k.slice(6)),
    unexplained,
  });
  if (unexplained.length > 0 || opts.dryRun) return summary(files);

  // ── Write ──
  const entriesOf = new Map<FileKey, HistoryEntry[]>();
  const get = (key: FileKey): HistoryEntry[] => {
    let list = entriesOf.get(key);
    if (!list) {
      const original = key.startsWith("cards/")
        ? cardHistories.get(key.slice(6))?.entries
        : histories.get(key)?.entries;
      const problems = chainProblems({ entries: original ?? [] });
      if (problems.length > 0)
        throw new Error(`${key}: chain already broken (${problems[0]}) — nothing logged`);
      list = [...(original ?? [])];
      entriesOf.set(key, list);
    }
    return list;
  };
  // Check every file before changing any.
  for (const { file, moveFrom } of planned) {
    get(file);
    if (moveFrom) get(moveFrom);
  }
  for (const [aid] of prepend) get(aid);

  for (const [aid, list] of prepend) for (const d of list) pushChained(get(aid), d);
  const moved = new Set<string>();
  const relinked = new Set<FileKey>();
  for (const { file, entry, moveFrom } of planned) {
    const list = get(file);
    if (moveFrom && !moved.has(entry.target.id)) {
      // Bring the entity's earlier entries along, in their order, keeping where they were written.
      const src = get(moveFrom);
      const mine = src.filter((e) => e.target.id === entry.target.id);
      const keep = src.filter((e) => e.target.id !== entry.target.id);
      src.splice(0, src.length, ...keep);
      for (const e of mine) {
        const { seq, chain: _c, ...draft } = e;
        pushChained(list, { ...draft, movedFrom: e.movedFrom ?? { article: moveFrom, seq } });
      }
      moved.add(entry.target.id);
      relinked.add(moveFrom);
    }
    pushChained(list, entry);
  }
  for (const key of relinked) relink(get(key));

  const written = [...entriesOf.keys()];
  const toStage: string[] = [];
  for (const key of written) {
    const entries = get(key);
    if (key.startsWith("cards/")) {
      const source = key.slice(6);
      writeCardHistory({ source: source as CardHistory["source"], entries }, store);
      toStage.push(cardHistoryPath(source, store));
      const src = join(store.contentDir, "sources", `${source}.json`);
      if (existsSync(src)) toStage.push(src);
    } else {
      writeHistory({ article: key, entries }, store);
      toStage.push(historyPath(key, store));
      const art = join(store.contentDir, "articles", `${key}.json`);
      if (existsSync(art)) toStage.push(art);
    }
  }
  store.stage(toStage);
  return summary(written);
}

// ── Seal ─────────────────────────────────────────────────────────────────

/** One chained `checkpoint` per card of the source, after the file's last entry. */
export function cardCheckpointEntries(
  s: SourceCards,
  history: CardHistory | undefined,
  at: string,
  actor: HistoryActor,
  run?: string,
): HistoryEntry[] {
  const entries = [...(history?.entries ?? [])];
  const out: HistoryEntry[] = [];
  for (const ent of cardEntities(s)) {
    out.push(
      pushChained(entries, {
        at,
        kind: "checkpoint",
        target: { type: "card", id: ent.id },
        reason: "State sealed: the start of the tamper-evident chain.",
        by: actor.name,
        actor,
        ...(run ? { run } : {}),
        hash: entityHash(ent.fields),
      }),
    );
  }
  return out;
}

export interface SealResult {
  articleEntries: number;
  cardEntries: number;
  files: number;
  root: string;
}

/**
 * Append a checkpoint for every entity of every article and every card of
 * every source, then return the Merkle root over all history files' heads.
 * Refuses (writing nothing) while any file's chain is broken.
 */
export function sealHistories(
  articles: readonly Article[],
  sources: readonly SourceCards[],
  opts: { at: string; actor: HistoryActor; run?: string; store?: HistoryStore; dryRun?: boolean },
): SealResult {
  const store = opts.store ?? GIT_STORE;
  const histories = readHistories(store);
  const cards = readCardHistories(store);
  const broken: string[] = [];
  for (const h of histories.values())
    for (const p of chainProblems(h)) broken.push(`${h.article}: ${p}`);
  for (const h of cards.values())
    for (const p of chainProblems(h)) broken.push(`cards/${h.source}: ${p}`);
  if (broken.length > 0) throw new Error(`chain broken — not sealed:\n${broken.join("\n")}`);
  const nextArticles: ArticleHistory[] = [];
  let articleEntries = 0;
  for (const a of articles) {
    const h = histories.get(a.id);
    const add = checkpointEntries(a, h, opts.at, opts.actor, opts.run);
    articleEntries += add.length;
    nextArticles.push({ article: a.id, entries: [...(h?.entries ?? []), ...add] });
  }
  const nextCards: CardHistory[] = [];
  let cardEntries = 0;
  for (const s of sources) {
    const h = cards.get(s.source);
    const add = cardCheckpointEntries(s, h, opts.at, opts.actor, opts.run);
    cardEntries += add.length;
    nextCards.push({ source: s.source, entries: [...(h?.entries ?? []), ...add] });
  }
  // Files of articles no longer in the bank still count towards the root.
  const sealed = new Set(articles.map((a) => a.id));
  const others = [...histories.values()].filter((h) => !sealed.has(h.article));
  const otherCards = [...cards.values()].filter((h) => !sources.some((s) => s.source === h.source));
  const all = [...nextArticles, ...others, ...nextCards, ...otherCards];
  const root = historyRoot(all);
  if (!opts.dryRun) {
    for (const h of nextArticles) writeHistory(h, store);
    for (const h of nextCards) writeCardHistory(h, store);
  }
  return { articleEntries, cardEntries, files: all.length, root };
}

/** The current Merkle root over every history file (articles and cards). */
export function currentHistoryRoot(store: HistoryStore = GIT_STORE): string {
  return historyRoot([...readHistories(store).values(), ...readCardHistories(store).values()]);
}

// ── Ref rewrite ──────────────────────────────────────────────────────────

export interface RefRewriteResult {
  files: number;
  entries: number;
  /** Refs the map doesn't know (left as they are), with their counts. */
  unmapped: Map<string, number>;
  /** Refs already pointing into the archive. */
  already: number;
}

/**
 * Point every history `ref` into the archive: `old` → `quiz-archive/<mapped>`
 * (each of a multi-file ref's space-separated paths prefixed). Refuses when a
 * chained entry would change (`ref` is covered by the chain, not by `hash`).
 */
export function rewriteRefs(
  map: Readonly<Record<string, string>>,
  opts: { store?: HistoryStore; dryRun?: boolean; prefix?: string } = {},
): RefRewriteResult {
  const store = opts.store ?? GIT_STORE;
  const prefix = opts.prefix ?? "quiz-archive/";
  const unmapped = new Map<string, number>();
  let already = 0;
  let entries = 0;
  const rewrite = (list: HistoryEntry[], where: string): boolean => {
    let changed = false;
    list.forEach((e, i) => {
      if (!e.ref) return;
      if (e.ref.startsWith(prefix)) {
        already++;
        return;
      }
      const to = map[e.ref];
      if (to === undefined) {
        unmapped.set(e.ref, (unmapped.get(e.ref) ?? 0) + 1);
        return;
      }
      if (e.chain) throw new Error(`${where} seq ${e.seq}: chained — its ref can't be rewritten`);
      const ref = to
        .split(" ")
        .filter(Boolean)
        .map((p) => `${prefix}${p}`)
        .join(" ");
      list[i] = { ...e, ref };
      entries++;
      changed = true;
    });
    return changed;
  };
  const writes: (() => void)[] = [];
  for (const h of readHistories(store).values()) {
    const list = [...h.entries];
    if (rewrite(list, h.article)) writes.push(() => writeHistory({ ...h, entries: list }, store));
  }
  for (const h of readCardHistories(store).values()) {
    const list = [...h.entries];
    if (rewrite(list, `cards/${h.source}`))
      writes.push(() => writeCardHistory({ ...h, entries: list }, store));
  }
  if (!opts.dryRun) for (const w of writes) w();
  return { files: writes.length, entries, unmapped, already };
}

/** `aNNNN#seq` / `cards/<source>#seq` → whether that entry exists. */
export function historyRefExists(ref: string, store: HistoryStore = GIT_STORE): boolean {
  const [file, seq] = ref.split("#");
  if (!file || !seq) return false;
  const path = file.startsWith("cards/")
    ? cardHistoryPath(basename(file), store)
    : historyPath(file, store);
  if (!existsSync(path)) return false;
  const raw = JSON.parse(readFileSync(path, "utf8")) as { entries?: { seq?: number }[] };
  return (raw.entries ?? []).some((e) => e.seq === Number(seq));
}
