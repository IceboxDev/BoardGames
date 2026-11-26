// What each member still owes the group (`GET /api/admin/outstanding`, rules
// in lib/member-outstanding.ts) and the admins' own notes on what else they
// believe a member owes (`/api/admin/users/:id/notes`, migration 0071).
// Admin-only: mounted behind `requireAdmin`; the notes are never shown to the
// member.

import {
  AdminMemberNoteResponseSchema,
  AdminMemberNotesResponseSchema,
  AdminOutstandingResponseSchema,
  CreateMemberNoteBodySchema,
  OkResponseSchema,
  UpdateMemberNoteBodySchema,
} from "@boardgames/core/protocol";
import type { Client } from "@libsql/client";
import { z } from "zod";
import { adminApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { parseRow, parseRows } from "../lib/db-rows.ts";
import { errorResponse, zJsonBody } from "../lib/error-response.ts";
import { computeOutstanding } from "../lib/member-outstanding.ts";

/** Mounted at `/api/admin`. */
export const adminOutstandingRoutes = adminApp();

adminOutstandingRoutes.get("/outstanding", async (c) => {
  const todayKey = new Date().toISOString().slice(0, 10);
  const members = await computeOutstanding(getDb(), todayKey);
  return c.json(AdminOutstandingResponseSchema.parse({ members }));
});

// ── Notes (mounted at `/api/admin/users`) ─────────────────────────────

export const adminMemberNoteRoutes = adminApp();

const NoteRowSchema = z.object({
  id: z.number(),
  text: z.string(),
  done_at: z.string().nullable(),
  created_at: z.string(),
  created_by_name: z.string().nullable(),
});

const NOTE_SELECT = `SELECT n.id, n.text, n.done_at, n.created_at, u.name AS created_by_name
                       FROM admin_member_notes n
                       LEFT JOIN "user" u ON u.id = n.created_by`;

const toNote = (r: z.infer<typeof NoteRowSchema>) => ({
  id: r.id,
  text: r.text,
  doneAt: r.done_at,
  createdAt: r.created_at,
  createdByName: r.created_by_name,
});

async function loadNote(db: Client, userId: string, noteId: number) {
  const { rows } = await db.execute({
    sql: `${NOTE_SELECT} WHERE n.id = ? AND n.user_id = ?`,
    args: [noteId, userId],
  });
  return rows[0] ? toNote(parseRow(NoteRowSchema, rows[0], "admin_member_notes")) : null;
}

const noteIdOf = (raw: string): number | null => {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
};

adminMemberNoteRoutes.get("/:id/notes", async (c) => {
  const { rows } = await getDb().execute({
    sql: `${NOTE_SELECT} WHERE n.user_id = ?
          ORDER BY n.done_at IS NOT NULL, COALESCE(n.done_at, n.created_at) DESC, n.id DESC`,
    args: [c.req.param("id")],
  });
  return c.json(
    AdminMemberNotesResponseSchema.parse({
      notes: parseRows(NoteRowSchema, rows, "admin_member_notes").map(toNote),
    }),
  );
});

adminMemberNoteRoutes.post("/:id/notes", zJsonBody(CreateMemberNoteBodySchema), async (c) => {
  const admin = c.get("user");
  const userId = c.req.param("id");
  const { text } = c.req.valid("json");
  const db = getDb();
  const exists = await db.execute({ sql: `SELECT 1 FROM "user" WHERE id = ?`, args: [userId] });
  if (exists.rows.length === 0) return errorResponse(c, 404, "user not found");
  const res = await db.execute({
    sql: "INSERT INTO admin_member_notes (user_id, text, created_by) VALUES (?, ?, ?) RETURNING id",
    args: [userId, text, admin.id],
  });
  const id = Number(res.rows[0]?.id);
  const note = await loadNote(db, userId, id);
  if (!note) return errorResponse(c, 500, "note not saved");
  return c.json(AdminMemberNoteResponseSchema.parse({ note }));
});

adminMemberNoteRoutes.patch(
  "/:id/notes/:noteId",
  zJsonBody(UpdateMemberNoteBodySchema),
  async (c) => {
    const userId = c.req.param("id");
    const noteId = noteIdOf(c.req.param("noteId"));
    if (noteId === null) return errorResponse(c, 400, "bad note id");
    const body = c.req.valid("json");
    const sets: string[] = ["updated_at = datetime('now')"];
    const args: (string | number)[] = [];
    if (body.text !== undefined) {
      sets.push("text = ?");
      args.push(body.text);
    }
    if (body.done !== undefined) {
      // Re-ticking a done note keeps its first done time.
      sets.push(body.done ? "done_at = COALESCE(done_at, datetime('now'))" : "done_at = NULL");
    }
    const db = getDb();
    const res = await db.execute({
      sql: `UPDATE admin_member_notes SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`,
      args: [...args, noteId, userId],
    });
    if (res.rowsAffected === 0) return errorResponse(c, 404, "note not found");
    const note = await loadNote(db, userId, noteId);
    if (!note) return errorResponse(c, 404, "note not found");
    return c.json(AdminMemberNoteResponseSchema.parse({ note }));
  },
);

adminMemberNoteRoutes.delete("/:id/notes/:noteId", async (c) => {
  const noteId = noteIdOf(c.req.param("noteId"));
  if (noteId === null) return errorResponse(c, 400, "bad note id");
  const res = await getDb().execute({
    sql: "DELETE FROM admin_member_notes WHERE id = ? AND user_id = ?",
    args: [noteId, c.req.param("id")],
  });
  if (res.rowsAffected === 0) return errorResponse(c, 404, "note not found");
  return c.json(OkResponseSchema.parse({ ok: true }));
});
