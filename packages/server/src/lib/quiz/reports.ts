// Quiz content reports: a member flags a problem with a question (a fact) or
// an article; an admin reviews the queue and resolves it. Where a target
// lives (its article, its domain, the cards that print it) is read from the
// content store, never stored with the report.
//
//   - The snapshot (what the reporter saw) is built HERE from the content
//     store, never taken from the client, so the review compares real
//     content: a snapshot that no longer matches the store means the content
//     changed since — usually, already fixed.
//   - One OPEN report per member, target and issue: reporting the same thing
//     again updates it (the migration's partial unique index backs this).
//   - Resolving is a claim: every UPDATE is guarded on `status = 'open'`, and
//     `rowsAffected` tells the caller what THIS request resolved, so two
//     admins can't both resolve (and both note) the same report.
//   - A resolution is unread for the reporter until they open their reports.
//   - A report may link the backlog item tracking it (`backlog_id`) and the
//     history entry that fixed it (`history_ref`, migration 0065): set when
//     resolving or later from the quiz desk (`linkReport`); reopening drops
//     the history link (the fix didn't hold) and keeps the backlog one.

import {
  type AdminReportGroup,
  type AdminReports,
  type CreateReportBodySchema,
  type MyReport,
  type MyReports,
  ReportIssueSchema,
  ReportLanguageSchema,
  type ReportSnapshot,
  ReportSnapshotSchema,
  type ReportStatus,
  ReportStatusSchema,
  ReportSurfaceSchema,
  type ReportTarget,
  ReportTargetSchema,
} from "@boardgames/core/protocol";
import type { Client } from "@libsql/client";
import { z } from "zod";
import { jsonColumn, parseRow, parseRows } from "../db-rows.ts";
import type { ContentStore } from "./content-store.ts";

export class ReportTargetNotFoundError extends Error {
  constructor(id: string) {
    super(`no question or article ${id}`);
    this.name = "ReportTargetNotFoundError";
  }
}

export type CreateReportInput = z.output<typeof CreateReportBodySchema>;

// ── Snapshot ───────────────────────────────────────────────────────────

/** The content a target shows now, or null when the store doesn't have it. */
export function snapshotFor(store: ContentStore, target: ReportTarget): ReportSnapshot | null {
  if (target.kind === "article") {
    const a = store.getArticleMeta(target.id);
    return a ? { kind: "article", titleEn: a.titleEn, titleDe: a.titleDe } : null;
  }
  const q = store.getFact(target.id);
  if (!q) return null;
  const wording = q.wordings[0];
  return {
    kind: "question",
    en: wording.en,
    de: wording.de,
    answerEn: q.answerEn,
    answerDe: q.answerDe,
    timeline: q.timeline
      ? {
          start: q.timeline.start,
          end: q.timeline.end,
          labelEn: q.timeline.labelEn,
          labelDe: q.timeline.labelDe,
        }
      : null,
    source: { url: q.source.url, title: q.source.title },
  };
}

/** Order-independent equality: snapshots from the DB and the store build keys alike, but don't rely on it. */
function sameSnapshot(a: ReportSnapshot, b: ReportSnapshot): boolean {
  const canon = (v: unknown): unknown =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>)
            .sort(([x], [y]) => x.localeCompare(y))
            .map(([k, val]) => [k, canon(val)]),
        )
      : v;
  return JSON.stringify(canon(a)) === JSON.stringify(canon(b));
}

/** The article and domain a target lives in now (null when the content no longer has it). */
function placeOf(
  store: ContentStore,
  target: ReportTarget,
): { articleId: string | null; domain: string | null } {
  const articleId =
    target.kind === "article"
      ? store.getArticleMeta(target.id)?.id
      : store.getFact(target.id)?.articleId;
  const domain = articleId ? store.getArticleMeta(articleId)?.domain : undefined;
  return { articleId: articleId ?? null, domain: domain ?? null };
}

// ── Rows ───────────────────────────────────────────────────────────────

const REPORT_COLUMNS = `r.id, r.user_id, r.target_kind, r.target_id, r.issue,
  r.language, r.message, r.surface, r.content_version, r.snapshot_json, r.status,
  r.resolution_note, r.resolved_at, r.reporter_seen_at, r.created_at, r.updated_at`;

const ReportRowSchema = z.object({
  id: z.number().int(),
  user_id: z.string(),
  target_kind: z.enum(["question", "article"]),
  target_id: z.string(),
  issue: ReportIssueSchema,
  language: ReportLanguageSchema,
  message: z.string().nullable(),
  surface: ReportSurfaceSchema,
  content_version: z.string(),
  snapshot_json: jsonColumn(ReportSnapshotSchema),
  status: ReportStatusSchema,
  resolution_note: z.string().nullable(),
  resolved_at: z.string().nullable(),
  reporter_seen_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
type ReportRow = z.infer<typeof ReportRowSchema>;

const AdminRowSchema = ReportRowSchema.extend({
  reporter_name: z.string(),
  resolved_by_name: z.string().nullable(),
});

function targetOf(row: ReportRow): ReportTarget {
  return ReportTargetSchema.parse({ kind: row.target_kind, id: row.target_id });
}

function toMyReport(store: ContentStore, row: ReportRow): MyReport {
  const target = targetOf(row);
  return {
    id: row.id,
    target,
    ...placeOf(store, target),
    issue: row.issue,
    language: row.language,
    message: row.message,
    surface: row.surface,
    status: row.status,
    resolutionNote: row.resolution_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
    unread: row.status !== "open" && row.reporter_seen_at === null,
    snapshot: row.snapshot_json,
  };
}

async function readOwn(
  db: Client,
  store: ContentStore,
  userId: string,
  id: number,
): Promise<MyReport | null> {
  const { rows } = await db.execute({
    sql: `SELECT ${REPORT_COLUMNS} FROM quiz_reports r WHERE r.id = ? AND r.user_id = ?`,
    args: [id, userId],
  });
  return rows[0] ? toMyReport(store, parseRow(ReportRowSchema, rows[0], "quiz_reports")) : null;
}

// ── Member ─────────────────────────────────────────────────────────────

/**
 * File a report, or update the member's open report of the same issue on
 * the same target. Throws `ReportTargetNotFoundError` for content the store
 * doesn't have.
 */
export async function createOrUpdateReport(
  db: Client,
  store: ContentStore,
  userId: string,
  body: CreateReportInput,
  now: Date = new Date(),
): Promise<{ report: MyReport; updated: boolean }> {
  const snapshot = snapshotFor(store, body.target);
  if (!snapshot) throw new ReportTargetNotFoundError(body.target.id);
  const at = now.toISOString();
  const message = body.message ?? null;

  const existing = await db.execute({
    sql: `SELECT id FROM quiz_reports
           WHERE user_id = ? AND target_id = ? AND issue = ? AND status = 'open'`,
    args: [userId, body.target.id, body.issue],
  });
  const { rows } = await db.execute({
    sql: `INSERT INTO quiz_reports
            (user_id, target_kind, target_id, issue, language, message, surface,
             content_version, snapshot_json, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (user_id, target_id, issue) WHERE status = 'open' DO UPDATE SET
            language = excluded.language,
            message = excluded.message,
            surface = excluded.surface,
            content_version = excluded.content_version,
            snapshot_json = excluded.snapshot_json,
            updated_at = excluded.updated_at
          RETURNING id`,
    args: [
      userId,
      body.target.kind,
      body.target.id,
      body.issue,
      body.language,
      message,
      body.surface,
      store.version,
      JSON.stringify(snapshot),
      at,
      at,
    ],
  });
  const id = parseRow(z.object({ id: z.number().int() }), rows[0], "quiz_reports.insert").id;
  const report = await readOwn(db, store, userId, id);
  if (!report) throw new Error(`quiz report ${id} vanished after write`);
  return { report, updated: existing.rows.length > 0 };
}

export async function myReports(
  db: Client,
  store: ContentStore,
  userId: string,
): Promise<MyReports> {
  const { rows } = await db.execute({
    sql: `SELECT ${REPORT_COLUMNS} FROM quiz_reports r
           WHERE r.user_id = ? ORDER BY r.created_at DESC, r.id DESC`,
    args: [userId],
  });
  const reports = parseRows(ReportRowSchema, rows, "quiz_reports.mine").map((row) =>
    toMyReport(store, row),
  );
  return { reports, unread: reports.filter((r) => r.unread).length };
}

/** Mark the member's resolved reports as seen. Returns how many changed. */
export async function markSeen(
  db: Client,
  userId: string,
  ids: readonly number[],
  now: Date = new Date(),
): Promise<number> {
  const res = await db.execute({
    sql: `UPDATE quiz_reports SET reporter_seen_at = ?
           WHERE user_id = ? AND status <> 'open' AND reporter_seen_at IS NULL
             AND id IN (${ids.map(() => "?").join(", ")})`,
    args: [now.toISOString(), userId, ...ids],
  });
  return res.rowsAffected;
}

/** Withdraw the member's own OPEN report. False when there's no such report. */
export async function withdrawReport(db: Client, userId: string, id: number): Promise<boolean> {
  const res = await db.execute({
    sql: "DELETE FROM quiz_reports WHERE id = ? AND user_id = ? AND status = 'open'",
    args: [id, userId],
  });
  return res.rowsAffected === 1;
}

// ── Admin ──────────────────────────────────────────────────────────────

export async function adminReports(
  db: Client,
  store: ContentStore,
  status: ReportStatus | "all",
): Promise<AdminReports> {
  const { rows } = await db.execute({
    sql: `SELECT ${REPORT_COLUMNS}, u.name AS reporter_name, rb.name AS resolved_by_name
            FROM quiz_reports r
            JOIN "user" u ON u.id = r.user_id
            LEFT JOIN "user" rb ON rb.id = r.resolved_by
           ${status === "all" ? "" : "WHERE r.status = ?"}
           ORDER BY r.created_at DESC, r.id DESC`,
    args: status === "all" ? [] : [status],
  });
  const groups = new Map<string, AdminReportGroup>();
  for (const row of parseRows(AdminRowSchema, rows, "quiz_reports.admin")) {
    let group = groups.get(row.target_id);
    if (!group) {
      const target = targetOf(row);
      const place = placeOf(store, target);
      const factIds =
        target.kind === "question" ? [target.id] : (store.getArticleMeta(target.id)?.factIds ?? []);
      group = {
        target,
        ...place,
        current: snapshotFor(store, target),
        changedSinceReport: false,
        printed: factIds.flatMap((id) => store.printedOn(id)),
        reports: [],
      };
      groups.set(row.target_id, group);
    }
    if (!group.current || !sameSnapshot(row.snapshot_json, group.current)) {
      group.changedSinceReport = true;
    }
    group.reports.push({
      id: row.id,
      reporterId: row.user_id,
      reporterName: row.reporter_name,
      issue: row.issue,
      language: row.language,
      message: row.message,
      surface: row.surface,
      status: row.status,
      resolutionNote: row.resolution_note,
      resolvedAt: row.resolved_at,
      resolvedByName: row.resolved_by_name,
      createdAt: row.created_at,
      contentVersion: row.content_version,
      snapshot: row.snapshot_json,
    });
  }

  const counts = { open: 0, fixed: 0, declined: 0 };
  const countRows = await db.execute(
    "SELECT status, COUNT(*) AS n FROM quiz_reports GROUP BY status",
  );
  for (const r of parseRows(
    z.object({ status: ReportStatusSchema, n: z.number().int() }),
    countRows.rows,
    "quiz_reports.counts",
  )) {
    counts[r.status] = r.n;
  }
  return { groups: [...groups.values()], counts };
}

export interface ReportLinks {
  /** The backlog item tracking the report (`b00012`). */
  backlogId?: string | null;
  /** The history entry that fixed it (`a0042#17`). */
  historyRef?: string | null;
}

/**
 * Resolve the still-open reports among `ids`. Returns how many THIS call
 * resolved. Links given are stored on each; omitted ones are left as they are.
 */
export async function resolveReports(
  db: Client,
  ids: readonly number[],
  status: "fixed" | "declined",
  note: string | undefined,
  adminId: string,
  now: Date = new Date(),
  links: ReportLinks = {},
): Promise<number> {
  const at = now.toISOString();
  const res = await db.execute({
    sql: `UPDATE quiz_reports
             SET status = ?, resolution_note = ?, resolved_by = ?, resolved_at = ?,
                 updated_at = ?, reporter_seen_at = NULL,
                 backlog_id = COALESCE(?, backlog_id), history_ref = COALESCE(?, history_ref)
           WHERE status = 'open' AND id IN (${ids.map(() => "?").join(", ")})`,
    args: [
      status,
      note ?? null,
      adminId,
      at,
      at,
      links.backlogId ?? null,
      links.historyRef ?? null,
      ...ids,
    ],
  });
  return res.rowsAffected;
}

/**
 * Set (a value) or clear (null) a report's links, whatever its status;
 * undefined leaves a link as it is. Null when there is no such report.
 */
export async function linkReport(
  db: Client,
  id: number,
  links: ReportLinks,
): Promise<{ id: number; backlogId: string | null; historyRef: string | null } | null> {
  const sets: string[] = [];
  const args: (string | null)[] = [];
  if (links.backlogId !== undefined) {
    sets.push("backlog_id = ?");
    args.push(links.backlogId);
  }
  if (links.historyRef !== undefined) {
    sets.push("history_ref = ?");
    args.push(links.historyRef);
  }
  const { rows } = await db.execute({
    sql:
      sets.length > 0
        ? `UPDATE quiz_reports SET ${sets.join(", ")} WHERE id = ? RETURNING id, backlog_id, history_ref`
        : "SELECT id, backlog_id, history_ref FROM quiz_reports WHERE id = ?",
    args: [...args, id],
  });
  if (!rows[0]) return null;
  const row = parseRow(
    z.object({
      id: z.number().int(),
      backlog_id: z.string().nullable(),
      history_ref: z.string().nullable(),
    }),
    rows[0],
    "quiz_reports.link",
  );
  return { id: row.id, backlogId: row.backlog_id, historyRef: row.history_ref };
}

export type ReopenResult = "reopened" | "not-found" | "duplicate-open";

/**
 * Put a resolved report back in the queue. "duplicate-open" when its
 * reporter has since filed the same issue again (that one is open already).
 */
export async function reopenReport(
  db: Client,
  id: number,
  now: Date = new Date(),
): Promise<ReopenResult> {
  try {
    const res = await db.execute({
      sql: `UPDATE quiz_reports
               SET status = 'open', resolution_note = NULL, resolved_by = NULL,
                   resolved_at = NULL, reporter_seen_at = NULL, history_ref = NULL,
                   updated_at = ?
             WHERE id = ? AND status <> 'open'`,
      args: [now.toISOString(), id],
    });
    return res.rowsAffected === 1 ? "reopened" : "not-found";
  } catch (err) {
    if (err instanceof Error && /UNIQUE/i.test(err.message)) return "duplicate-open";
    throw err;
  }
}
