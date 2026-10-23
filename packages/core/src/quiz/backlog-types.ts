// The quiz bank's backlog: `content/backlog.jsonl`, one item per line — the
// open work on the bank in one place (photo checks, facts to verify or
// re-research, stale time-sensitive answers, member reports, rework, ideas,
// candidate questions). An item is closed by the history entry that did the
// work (`closedBy`) or, when won't fix, by a reason. Browser-safe.

import { z } from "zod";
import { DayKeySchema, DomainSlugSchema } from "./content-types.ts";
import { RunIdSchema } from "./history-schema.ts";
import { BACKLOG_ID_RE, SOURCE_CARD_ID_RE } from "./ids.ts";
import { SOURCE_IDS } from "./sources.ts";

export const BACKLOG_KINDS = [
  "verify",
  "research",
  "photo-check",
  "stale",
  "report",
  "rework",
  "idea",
  "candidate",
] as const;
export type BacklogKind = (typeof BACKLOG_KINDS)[number];

export const BACKLOG_STATUSES = ["open", "doing", "done", "wontfix"] as const;
export type BacklogStatus = (typeof BACKLOG_STATUSES)[number];

/**
 * What an item is about: an article, fact or wording id; an article's body
 * (`a0042:body`); a printed card (`quiztopia/c042`); a domain
 * (`domain:history`, for ideas and candidates); or a member report
 * (`report:<quiz_reports id>`).
 */
export const BACKLOG_TARGET_RE =
  /^(?:a\d{4,}(?::body)?|f\d{5,}|w\d{5,}|[a-z0-9-]+\/[a-z0-9][a-z0-9-]{0,31}|domain:[a-z0-9-]+|report:[A-Za-z0-9_-]+)$/;

/** A history entry: `a0042#17` (article file, seq) or `cards/quiztopia#3`. */
export const HISTORY_REF_RE = /^(?:a\d{4,}|cards\/[a-z0-9-]+)#[1-9]\d*$/;

export const BacklogItemSchema = z
  .object({
    id: z.string().regex(BACKLOG_ID_RE),
    kind: z.enum(BACKLOG_KINDS),
    target: z.string().regex(BACKLOG_TARGET_RE),
    /** 1 = most urgent … 4 = someday. */
    priority: z.number().int().min(1).max(4),
    status: z.enum(BACKLOG_STATUSES),
    created: DayKeySchema,
    by: z.string().min(1),
    run: RunIdSchema.optional(),
    notes: z.string(),
    /** Photos, reports, run files, pages — anything that helps whoever picks it up. */
    links: z.array(z.string().min(1)),
    /** The history entry that did the work (`a0042#17`); required when done. */
    closedBy: z.string().regex(HISTORY_REF_RE).optional(),
    /** Why it won't be done; required when wontfix. */
    closeReason: z.string().min(1).optional(),
    closedAt: DayKeySchema.optional(),
  })
  .superRefine((b, ctx) => {
    if (b.status === "done" && !b.closedBy)
      ctx.addIssue({ code: "custom", path: ["closedBy"], message: "done needs closedBy" });
    if (b.status === "wontfix" && !b.closeReason)
      ctx.addIssue({ code: "custom", path: ["closeReason"], message: "wontfix needs a reason" });
  });
export type BacklogItem = z.infer<typeof BacklogItemSchema>;

/** `backlog.jsonl` → items (blank lines skipped); throws on a bad line, naming it. */
export function parseBacklog(text: string): BacklogItem[] {
  const out: BacklogItem[] = [];
  text.split("\n").forEach((line, i) => {
    if (!line.trim()) return;
    const r = BacklogItemSchema.safeParse(JSON.parse(line));
    if (!r.success) throw new Error(`backlog.jsonl line ${i + 1}: ${r.error.message}`);
    out.push(r.data);
  });
  return out;
}

export function serializeBacklog(items: readonly BacklogItem[]): string {
  return items.map((b) => `${JSON.stringify(b)}\n`).join("");
}

interface BankLike {
  articles: readonly {
    id: string;
    facts: readonly {
      id: string;
      wordings: readonly { id: string }[];
      retiredWordings?: readonly { id: string }[];
    }[];
    retired?: readonly {
      id: string;
      wordings: readonly { id: string }[];
      retiredWordings?: readonly { id: string }[];
    }[];
  }[];
  sources?: readonly { source: string; cards: readonly { id: string }[] }[];
  /** History files by key (`a0042`, `cards/quiztopia`) → their seqs; checks `closedBy` when given. */
  historySeqs?: ReadonlyMap<string, ReadonlySet<number>>;
}

/**
 * Cross-file problems: duplicate ids, targets that don't exist (retired
 * entities count — they are kept), a done item without `closedBy` or a
 * wontfix without a reason, and — with `historySeqs` — a `closedBy` that
 * points at no history entry.
 */
export function backlogProblems(items: readonly BacklogItem[], bank: BankLike): string[] {
  const ids = new Set<string>();
  for (const a of bank.articles) {
    ids.add(a.id);
    ids.add(`${a.id}:body`);
    for (const f of [...a.facts, ...(a.retired ?? [])]) {
      ids.add(f.id);
      for (const w of [...f.wordings, ...(f.retiredWordings ?? [])]) ids.add(w.id);
    }
  }
  for (const s of bank.sources ?? []) for (const c of s.cards) ids.add(`${s.source}/${c.id}`);
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const b of items) {
    if (seen.has(b.id)) problems.push(`${b.id}: duplicate backlog id`);
    seen.add(b.id);
    const t = b.target;
    if (t.startsWith("domain:")) {
      if (!DomainSlugSchema.safeParse(t.slice(7)).success)
        problems.push(`${b.id}: unknown domain ${t}`);
    } else if (t.startsWith("report:")) {
      // Reports live in the database; linked, not checked here.
    } else if (t.includes("/")) {
      const [source, card] = t.split("/");
      if (!(SOURCE_IDS as readonly string[]).includes(source) || !SOURCE_CARD_ID_RE.test(card))
        problems.push(`${b.id}: unknown card ${t}`);
      else if (bank.sources && !ids.has(t)) problems.push(`${b.id}: unknown card ${t}`);
    } else if (!ids.has(t)) {
      problems.push(`${b.id}: unknown target ${t}`);
    }
    if (b.status === "done" && !b.closedBy) problems.push(`${b.id}: done without closedBy`);
    if (b.status === "wontfix" && !b.closeReason)
      problems.push(`${b.id}: wontfix without a reason`);
    if (b.closedBy && bank.historySeqs) {
      const [file, seq] = b.closedBy.split("#");
      if (!bank.historySeqs.get(file)?.has(Number(seq)))
        problems.push(`${b.id}: closedBy ${b.closedBy} is no history entry`);
    }
  }
  return problems;
}
