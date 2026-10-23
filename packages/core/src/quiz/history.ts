// The changelog of the quiz bank: every article, fact and wording carries a
// history of what changed, when, why and on what evidence — from the printed
// card's own words through rewordings, errata, corrections, translations,
// splits and retirements. One file per article, `content/history/aNNNN.json`,
// holding the entries of the article and of every fact (and its wordings)
// that lives in it now; when a fact moves, its entries move with it.
//
// Tracking is enforced: each entity's latest entry records the entity's hash
// after the change (`hash`), and `historyProblems` reports any entity whose
// current content no longer matches — an edit nobody logged. Nothing is ever
// deleted either: a history entry whose target is gone is a problem too, so a
// fact leaves the active bank only by retiring (`Article.retired`).
//
// Entries before the tracked era (the backfill from the printed cards, merge
// decisions and enrichment reports) may lack `hash` and full values; the
// first `checkpoint` entry seals each entity's state at the start of strict
// tracking. Short field values are stored whole (`old` / `new`); long texts
// as a word-level diff (`diff`) so the bodies aren't copied into the history.

import { createHash } from "node:crypto";
import type {
  Article,
  Fact,
  RetiredFact,
  RetiredWording,
  SourceCard,
  SourceCards,
  Wording,
} from "./content-types.ts";
import type {
  ArticleHistory,
  CardHistory,
  HistoryActor,
  HistoryChange,
  HistoryEntry,
  HistoryTargetType,
  TextDiffOp,
} from "./history-schema.ts";

// The file shapes live in the browser-safe `history-schema.ts`.
export * from "./history-schema.ts";

// ── Entities and their hashes ────────────────────────────────────────────

export type EntityFields = Record<string, unknown>;

export interface Entity {
  type: HistoryTargetType;
  id: string;
  fields: EntityFields;
}

const ARTICLE_FIELDS = [
  "domain",
  "sub",
  "titleEn",
  "titleDe",
  "titleRu",
  "bodyEn",
  "bodyDe",
  "bodyRu",
  "notesEn",
  "notesDe",
  "notesRu",
  "images",
] as const;
const FACT_FIELDS = [
  "answerEn",
  "answerDe",
  "answerRu",
  "spans",
  "timeline",
  "source",
  "retired",
] as const;
const WORDING_FIELDS = ["en", "de", "ru", "origin", "printed", "cardText"] as const;
// Fields added after the bank was sealed: hashed only when present, so an
// entity without them keeps the hash it had (`pick` would store a null).
const ARTICLE_OPTIONAL_FIELDS = ["tags", "entities", "articleRetired"] as const;
const FACT_OPTIONAL_FIELDS = ["tags", "entities", "reviewBy"] as const;

function pick(
  obj: object,
  keys: readonly string[],
  optional: readonly string[] = [],
): EntityFields {
  const rec = obj as Record<string, unknown>;
  const out: EntityFields = {};
  for (const k of keys) out[k] = rec[k] ?? null;
  for (const k of optional) if (rec[k] !== undefined) out[k] = rec[k];
  return out;
}

export function articleFields(a: Article): EntityFields {
  return pick(a, ARTICLE_FIELDS, ARTICLE_OPTIONAL_FIELDS);
}

export function factFields(f: Fact | RetiredFact): EntityFields {
  return pick(f, FACT_FIELDS, FACT_OPTIONAL_FIELDS);
}

/** A printed card's tracked state: its photo and which wording sits in each slot. */
export function cardFields(card: SourceCard): EntityFields {
  return { image: card.image, slots: card.slots };
}

/** Every card of a source as a `card` entity, keyed by card id. */
export function cardEntities(s: SourceCards): Entity[] {
  return s.cards.map((c) => ({ type: "card" as const, id: c.id, fields: cardFields(c) }));
}

/**
 * A wording's content plus the fact it belongs to, so moving it to another
 * fact is a change; a retired wording also carries its retirement (only then,
 * so an active wording's hash doesn't move).
 */
export function wordingFields(w: Wording | RetiredWording, factId: string): EntityFields {
  return {
    ...pick(w, WORDING_FIELDS),
    fact: factId,
    ...("retired" in w && w.retired ? { retired: w.retired } : {}),
  };
}

/** The article, then each fact (active, then retired) followed by its wordings. */
export function articleEntities(a: Article): Entity[] {
  const out: Entity[] = [{ type: "article", id: a.id, fields: articleFields(a) }];
  for (const f of [...a.facts, ...(a.retired ?? [])]) {
    out.push({ type: "fact", id: f.id, fields: factFields(f) });
    for (const w of [...f.wordings, ...(f.retiredWordings ?? [])]) {
      out.push({ type: "wording", id: w.id, fields: wordingFields(w, f.id) });
    }
  }
  return out;
}

/** JSON with object keys sorted at every level, so equal content hashes equally. */
export function stableStringify(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const rec = value as Record<string, unknown>;
  const keys = Object.keys(rec)
    .filter((k) => rec[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(rec[k])}`).join(",")}}`;
}

export function entityHash(fields: EntityFields): string {
  return createHash("sha256").update(stableStringify(fields)).digest("hex").slice(0, 12);
}

// ── Text diffs ───────────────────────────────────────────────────────────

/** Fields whose values are long enough to be stored as a diff. */
export const DIFF_MIN_LENGTH = 240;

function tokenize(text: string): string[] {
  return text.match(/\s+|\S+/g) ?? [];
}

/** Edit distances past this give up on a fine diff (a full rewrite is stored as -old +new). */
const MAX_EDIT_DISTANCE = 1500;

/**
 * Myers' O(ND) shortest edit script over token arrays, or null when the two
 * texts are further apart than `MAX_EDIT_DISTANCE`. Each round keeps only
 * the 2d+1 diagonals it reached, so memory stays O(D²).
 */
function editScript(a: string[], b: string[]): ("=" | "-" | "+")[] | null {
  const n = a.length;
  const m = b.length;
  const max = Math.min(n + m, MAX_EDIT_DISTANCE);
  // trace[d][k + d] = furthest x on diagonal k after d edits.
  const trace: Int32Array[] = [];
  let prev = new Int32Array(1);
  let found = -1;
  for (let d = 0; d <= max && found < 0; d++) {
    const cur = new Int32Array(2 * d + 1);
    for (let k = -d; k <= d; k += 2) {
      const down = k === -d || (k !== d && prev[k - 1 + (d - 1)] < prev[k + 1 + (d - 1)]);
      let x = d === 0 ? 0 : down ? prev[k + 1 + (d - 1)] : prev[k - 1 + (d - 1)] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      cur[k + d] = x;
      if (x >= n && y >= m) found = d;
    }
    trace.push(cur);
    prev = cur;
  }
  if (found < 0) return null;
  const ops: ("=" | "-" | "+")[] = [];
  let x = n;
  let y = m;
  for (let d = found; d > 0; d--) {
    const pv = trace[d - 1];
    const k = x - y;
    const down = k === -d || (k !== d && pv[k - 1 + (d - 1)] < pv[k + 1 + (d - 1)]);
    const prevK = down ? k + 1 : k - 1;
    const prevX = pv[prevK + (d - 1)];
    const prevY = prevX - prevK;
    const startX = down ? prevX : prevX + 1;
    const startY = startX - k;
    while (x > startX && y > startY) {
      ops.push("=");
      x--;
      y--;
    }
    ops.push(down ? "+" : "-");
    x = prevX;
    y = prevY;
  }
  while (x > 0 && y > 0) {
    ops.push("=");
    x--;
    y--;
  }
  return ops.reverse();
}

export function textDiff(oldText: string, newText: string): TextDiffOp[] {
  const a = tokenize(oldText);
  const b = tokenize(newText);
  const script = editScript(a, b);
  if (!script) return [...(oldText ? [["-", oldText] as TextDiffOp] : []), ["+", newText]];
  const out: TextDiffOp[] = [];
  let i = 0;
  let j = 0;
  for (const op of script) {
    const last = out[out.length - 1];
    if (op === "=") {
      if (last?.[0] === "=") last[1] += 1;
      else out.push(["=", 1]);
      i++;
      j++;
    } else if (op === "-") {
      if (last?.[0] === "-") last[1] += a[i];
      else out.push(["-", a[i]]);
      i++;
    } else {
      if (last?.[0] === "+") last[1] += b[j];
      else out.push(["+", b[j]]);
      j++;
    }
  }
  return out;
}

/** Old text + its diff → the new text. */
export function applyTextDiff(oldText: string, ops: readonly TextDiffOp[]): string {
  const a = tokenize(oldText);
  let i = 0;
  let out = "";
  for (const op of ops) {
    if (op[0] === "=") {
      out += a.slice(i, i + op[1]).join("");
      i += op[1];
    } else if (op[0] === "-") {
      i += tokenize(op[1]).length;
    } else {
      out += op[1];
    }
  }
  return out;
}

/** New text + its diff → the old text. */
export function revertTextDiff(newText: string, ops: readonly TextDiffOp[]): string {
  const b = tokenize(newText);
  let j = 0;
  let out = "";
  for (const op of ops) {
    if (op[0] === "=") {
      out += b.slice(j, j + op[1]).join("");
      j += op[1];
    } else if (op[0] === "+") {
      j += tokenize(op[1]).length;
    } else {
      out += op[1];
    }
  }
  return out;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * The field-level changes from `prev` to `cur`; `prev` null = the entity is
 * new. Objects (timeline, spans, source) record only their changed keys.
 */
export function fieldChanges(prev: EntityFields | null, cur: EntityFields): HistoryChange[] {
  const out: HistoryChange[] = [];
  for (const field of Object.keys(cur)) {
    const before = prev ? (prev[field] ?? null) : null;
    const after = cur[field] ?? null;
    if (stableStringify(before) === stableStringify(after)) continue;
    if (
      typeof before === "string" &&
      typeof after === "string" &&
      Math.max(before.length, after.length) >= DIFF_MIN_LENGTH
    ) {
      out.push({ field, diff: textDiff(before, after) });
    } else if (before === null && typeof after === "string" && after.length >= DIFF_MIN_LENGTH) {
      out.push({ field, diff: [["+", after]] });
    } else if (isPlainObject(before) && isPlainObject(after)) {
      // Only the sub-keys that changed (a timeline's label, one span).
      const old: Record<string, unknown> = {};
      const neu: Record<string, unknown> = {};
      for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
        if (stableStringify(before[k]) === stableStringify(after[k])) continue;
        old[k] = before[k] ?? null;
        neu[k] = after[k] ?? null;
      }
      out.push({ field, old, new: neu });
    } else {
      out.push({ field, ...(before !== null ? { old: before } : {}), new: after });
    }
  }
  return out;
}

// ── Integrity ────────────────────────────────────────────────────────────

/**
 * Every tracking invariant of one article's history, as readable problems:
 * a history file exists, its seqs increase, every entity of the article has
 * entries and its latest entry's hash matches its content (no unlogged
 * edit), and no entry targets something that is no longer in the article
 * (deleted, or moved without its history).
 */
export function historyProblems(a: Article, history: ArticleHistory | undefined): string[] {
  if (!history) return [`${a.id}: no history file`];
  const problems: string[] = [];
  if (history.article !== a.id) problems.push(`${a.id}: history file is for ${history.article}`);
  let seq = 0;
  const latest = new Map<string, HistoryEntry>();
  for (const e of history.entries) {
    if (e.seq <= seq) problems.push(`${a.id}: history seq ${e.seq} out of order`);
    seq = e.seq;
    latest.set(`${e.target.type}:${e.target.id}`, e);
  }
  const live = new Set<string>();
  for (const ent of articleEntities(a)) {
    const key = `${ent.type}:${ent.id}`;
    live.add(key);
    const last = latest.get(key);
    if (!last) {
      problems.push(`${ent.id}: no history`);
      continue;
    }
    const hash = entityHash(ent.fields);
    if (last.hash !== hash) problems.push(`${ent.id}: changed without a history entry`);
  }
  // An article's retirement entries are about the article itself.
  live.add(`article-retirement:${a.id}`);
  for (const key of latest.keys()) {
    if (!live.has(key)) {
      problems.push(`${key.split(":")[1]}: has history in ${a.id} but is no longer there`);
    }
  }
  return problems;
}

// ── Hash chain, checkpoints, root ────────────────────────────────────────

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

/**
 * The chain link of `entry`: sha256 of the previous chained entry's link
 * ("" for the first) and the entry itself without `chain`, stably stringified.
 * Every field but `chain` is covered, `ref` included.
 */
export function entryChain(prevChain: string | null, entry: HistoryEntry): string {
  const { chain: _chain, ...rest } = entry;
  return sha256(`${prevChain ?? ""}${stableStringify(rest)}`);
}

/** The link the next chained entry of this file builds on (null before the chain starts). */
export function lastChain(entries: readonly HistoryEntry[]): string | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const c = entries[i].chain;
    if (c) return c;
  }
  return null;
}

/** `entry` with its chain link set, following `prevChain`. */
export function chainEntry(prevChain: string | null, entry: HistoryEntry): HistoryEntry {
  return { ...entry, chain: entryChain(prevChain, entry) };
}

/**
 * The chain's integrity: every entry with a `chain` links to the previous
 * chained entry (the first to nothing — it may follow the unchained backfill),
 * and once the chain starts, no entry after it goes unchained.
 */
export function chainProblems(history: { entries: readonly HistoryEntry[] }): string[] {
  const problems: string[] = [];
  let prev: string | null = null;
  let started = false;
  for (const e of history.entries) {
    if (!e.chain) {
      if (started) problems.push(`seq ${e.seq}: unchained entry after the chain started`);
      continue;
    }
    started = true;
    if (e.chain !== entryChain(prev, e)) problems.push(`seq ${e.seq}: chain link broken`);
    prev = e.chain;
  }
  return problems;
}

/**
 * One `checkpoint` per entity of the article (in `articleEntities` order),
 * sealing each one's current hash, numbered after the file's last seq and
 * chained onto its last link. Append them to the file's entries.
 */
export function checkpointEntries(
  a: Article,
  history: ArticleHistory | undefined,
  at: string,
  actor: HistoryActor,
  run?: string,
): HistoryEntry[] {
  const entries = history?.entries ?? [];
  let seq = entries.length > 0 ? entries[entries.length - 1].seq : 0;
  let prev = lastChain(entries);
  return articleEntities(a).map((ent) => {
    const entry = chainEntry(prev, {
      seq: ++seq,
      at,
      kind: "checkpoint",
      target: { type: ent.type, id: ent.id },
      reason: "State sealed: the start of the tamper-evident chain.",
      by: actor.name,
      actor,
      ...(run ? { run } : {}),
      hash: entityHash(ent.fields),
    });
    prev = entry.chain ?? null;
    return entry;
  });
}

/** The head of a history file: its last chain link, else its last entry's hash, else "". */
export function historyHead(entries: readonly HistoryEntry[]): string {
  return lastChain(entries) ?? entries[entries.length - 1]?.hash ?? "";
}

/**
 * A Merkle root over every history file's head (`meta.json` `historyRoot`):
 * leaves sha256(`<file key>:<head>`) sorted by key (`aNNNN`, `cards/<source>`),
 * paired level by level (an odd last node is carried up as is).
 */
export function historyRoot(histories: readonly (ArticleHistory | CardHistory)[]): string {
  let level = histories
    .map((h) => ("article" in h ? h.article : `cards/${h.source}`))
    .map((key, i) => ({ key, head: historyHead(histories[i].entries) }))
    .sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0))
    .map(({ key, head }) => sha256(`${key}:${head}`));
  if (level.length === 0) return sha256("");
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(i + 1 < level.length ? sha256(level[i] + level[i + 1]) : level[i]);
    }
    level = next;
  }
  return level[0];
}

/**
 * A source's card history: seqs increase, the chain holds, no entry targets
 * a card the source doesn't have, and every card with a hashed entry still
 * matches it. `strict` also requires an entry for every card.
 */
export function cardHistoryProblems(
  s: SourceCards,
  history: CardHistory | undefined,
  opts: { strict?: boolean } = {},
): string[] {
  if (!history) return opts.strict ? [`cards/${s.source}: no history file`] : [];
  const problems: string[] = [];
  const where = `cards/${s.source}`;
  if (history.source !== s.source) problems.push(`${where}: history file is for ${history.source}`);
  let seq = 0;
  const latest = new Map<string, HistoryEntry>();
  for (const e of history.entries) {
    if (e.seq <= seq) problems.push(`${where}: history seq ${e.seq} out of order`);
    seq = e.seq;
    if (e.target.type !== "card")
      problems.push(`${where}: seq ${e.seq} targets a ${e.target.type}`);
    else if (e.hash) latest.set(e.target.id, e);
  }
  const cards = new Set<string>();
  for (const ent of cardEntities(s)) {
    cards.add(ent.id);
    const last = latest.get(ent.id);
    if (!last) {
      if (opts.strict) problems.push(`${where}/${ent.id}: no history`);
      continue;
    }
    if (last.hash !== entityHash(ent.fields))
      problems.push(`${where}/${ent.id}: changed without a history entry`);
  }
  for (const e of history.entries) {
    if (e.target.type === "card" && !cards.has(e.target.id))
      problems.push(`${where}/${e.target.id}: has history but is no longer there`);
  }
  for (const p of chainProblems(history)) problems.push(`${where}: ${p}`);
  return problems;
}

/** A history file: one entry per line, so a change shows as added lines in a diff. */
export function serializeHistory(h: ArticleHistory | CardHistory): string {
  const lines = h.entries.map((e) => JSON.stringify(e));
  const head =
    "article" in h
      ? `"article":${JSON.stringify(h.article)}`
      : `"source":${JSON.stringify(h.source)}`;
  return `{${head},"entries":[\n${lines.join(",\n")}\n]}\n`;
}

/** The entries about one entity, oldest first. */
export function entriesFor(history: ArticleHistory | CardHistory, id: string): HistoryEntry[] {
  return history.entries.filter((e) => e.target.id === id);
}
