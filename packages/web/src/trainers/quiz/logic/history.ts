import type { ArticleHistoryEntry } from "@boardgames/core/protocol";
import type { Article, Fact, RetiredFact } from "@boardgames/core/quiz/content-types";
import type { HistoryKind, TextDiffOp } from "@boardgames/core/quiz/history-schema";

// The article history panel's pure side: which entries belong to which
// question, what text each long-field change left behind (so a word diff can
// show a little context around its edits), and a compact form of the diff.
// The history file stores long texts as word diffs whose kept runs are only
// token COUNTS; the context comes from walking back from the article's
// current text, reverting each diff in turn (the same tokens as core
// `quiz/history.ts`, which can't be imported here: it needs node:crypto).

export type HistoryEntry = ArticleHistoryEntry;

export interface HistoryGroup {
  key: string;
  kind: "article" | "fact" | "retired" | "other";
  /** The fact the group is about (fact / retired groups). */
  factId?: string;
  /** Position of an active fact in the article (Q1 = 0). */
  index?: number;
  entries: HistoryEntry[];
}

/** A checkpoint that records nothing of its own is bookkeeping, not history. */
export function isNoise(e: HistoryEntry): boolean {
  return e.kind === "checkpoint" && !e.changes?.length;
}

/**
 * The entries per group, oldest first: the article, each active fact with
 * its wordings (in article order), each retired fact with its wordings, and
 * anything whose target the article no longer holds. Empty groups are left out.
 */
export function groupHistory(entries: readonly HistoryEntry[], article: Article): HistoryGroup[] {
  const groups: HistoryGroup[] = [{ key: "article", kind: "article", entries: [] }];
  const groupOf = new Map<string, HistoryGroup>([[article.id, groups[0]]]);
  const add = (group: HistoryGroup, fact: Fact | RetiredFact) => {
    groups.push(group);
    groupOf.set(fact.id, group);
    for (const w of fact.wordings) groupOf.set(w.id, group);
  };
  article.facts.forEach((f, index) => {
    add({ key: f.id, kind: "fact", factId: f.id, index, entries: [] }, f);
  });
  for (const f of article.retired ?? []) {
    add({ key: f.id, kind: "retired", factId: f.id, entries: [] }, f);
  }
  const other: HistoryGroup = { key: "other", kind: "other", entries: [] };
  for (const e of [...entries].sort((a, b) => a.seq - b.seq)) {
    if (isNoise(e)) continue;
    (groupOf.get(e.target.id) ?? other).entries.push(e);
  }
  groups.push(other);
  return groups.filter((g) => g.entries.length > 0);
}

// ── Texts and diffs ──────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text.match(/\s+|\S+/g) ?? [];
}

/** New text + its diff → the old text; undefined when the diff doesn't fit the text. */
function revert(newText: string, ops: readonly TextDiffOp[]): string | undefined {
  const b = tokenize(newText);
  let j = 0;
  let out = "";
  for (const op of ops) {
    if (op[0] === "=") {
      if (j + op[1] > b.length) return undefined;
      out += b.slice(j, j + op[1]).join("");
      j += op[1];
    } else if (op[0] === "+") {
      j += tokenize(op[1]).length;
    } else {
      out += op[1];
    }
  }
  return j === b.length ? out : undefined;
}

function fieldsOf(article: Article): Map<string, Record<string, unknown>> {
  const out = new Map<string, Record<string, unknown>>();
  out.set(article.id, article);
  const addFact = (f: Fact | RetiredFact) => {
    out.set(f.id, f);
    for (const w of f.wordings) out.set(w.id, w);
  };
  for (const f of article.facts) addFact(f);
  for (const f of article.retired ?? []) addFact(f);
  return out;
}

export const textKey = (seq: number, field: string) => `${seq}:${field}`;

/**
 * The text a string field held right after each change to it, keyed by
 * `textKey(seq, field)`, found by walking back from the current article. A
 * change whose text can't be recovered (a whole-value change with no old
 * value, a diff that doesn't fit) has no entry, nor has anything before it.
 */
export function textsAfter(
  entries: readonly HistoryEntry[],
  article: Article,
): Map<string, string> {
  const current = fieldsOf(article);
  const out = new Map<string, string>();
  const cursor = new Map<string, string | undefined>();
  for (const e of [...entries].sort((a, b) => b.seq - a.seq)) {
    for (const c of e.changes ?? []) {
      const key = `${e.target.id}:${c.field}`;
      const now = cursor.has(key) ? cursor.get(key) : current.get(e.target.id)?.[c.field];
      const text = typeof now === "string" ? now : undefined;
      if (text !== undefined) out.set(textKey(e.seq, c.field), text);
      let before: string | undefined;
      if (c.diff) before = text === undefined ? undefined : revert(text, c.diff);
      else if (typeof c.old === "string") before = c.old;
      cursor.set(key, before);
    }
  }
  return out;
}

export type DiffPiece =
  | { type: "same"; text: string }
  | { type: "gap" }
  | { type: "del"; text: string }
  | { type: "ins"; text: string };

/** Tokens of kept text shown either side of an edit (≈ four words). */
export const DIFF_CONTEXT = 8;

/**
 * The diff as its edits with a little kept text around each: unchanged runs
 * longer than the context collapse to a gap, and with no `after` text to
 * read them from they are gaps altogether.
 */
export function compactDiff(
  ops: readonly TextDiffOp[],
  after: string | undefined,
  context = DIFF_CONTEXT,
): DiffPiece[] {
  const tokens = after === undefined ? null : tokenize(after);
  const out: DiffPiece[] = [];
  let j = 0;
  ops.forEach((op, i) => {
    if (op[0] === "-") {
      out.push({ type: "del", text: op[1] });
      return;
    }
    if (op[0] === "+") {
      out.push({ type: "ins", text: op[1] });
      j += tokenize(op[1]).length;
      return;
    }
    const kept = tokens?.slice(j, j + op[1]);
    j += op[1];
    if (!kept || kept.length < op[1]) {
      out.push({ type: "gap" });
      return;
    }
    const first = i === 0;
    const last = i === ops.length - 1;
    if (first && last) out.push({ type: "gap" });
    else if (first) {
      if (kept.length > context) out.push({ type: "gap" });
      out.push({ type: "same", text: kept.slice(-context).join("") });
    } else if (last) {
      out.push({ type: "same", text: kept.slice(0, context).join("") });
      if (kept.length > context) out.push({ type: "gap" });
    } else if (kept.length > 2 * context) {
      out.push({ type: "same", text: kept.slice(0, context).join("") });
      out.push({ type: "gap" });
      out.push({ type: "same", text: kept.slice(-context).join("") });
    } else {
      out.push({ type: "same", text: kept.join("") });
    }
  });
  return out;
}

// ── Values ───────────────────────────────────────────────────────────────

/** Fields whose values mean nothing to a reader (offsets, image lists): the label only. */
const LABEL_ONLY = new Set(["spans", "images"]);

const MAX_VALUE = 160;

function clip(s: string, max = MAX_VALUE): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** A change's value as one short line; null when there's nothing worth showing. */
export function formatValue(field: string, value: unknown): string | null {
  if (LABEL_ONLY.has(field) || value === undefined) return null;
  if (value === null) return "—";
  if (typeof value === "string") return clip(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return clip(value.map((v) => formatValue(field, v) ?? "").join(", "));
  if (typeof value === "object") {
    const parts = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .map(
        ([k, v]) => `${k}: ${typeof v === "object" && v !== null ? JSON.stringify(v) : String(v)}`,
      );
    return clip(parts.join(" · "));
  }
  return null;
}

export type KindTone = "amber" | "cyan" | "neutral" | "rose";

/** Each kind's badge tone, by family: the card and its errata, corrections, housekeeping, retirement. */
export const KIND_TONE: Record<HistoryKind, KindTone> = {
  printed: "amber",
  imported: "amber",
  reworded: "amber",
  errata: "amber",
  flagged: "amber",
  corrected: "cyan",
  created: "cyan",
  edited: "cyan",
  split: "cyan",
  merged: "cyan",
  moved: "cyan",
  restored: "cyan",
  translated: "neutral",
  marked: "neutral",
  illustrated: "neutral",
  recategorised: "neutral",
  checkpoint: "neutral",
  retired: "rose",
};
