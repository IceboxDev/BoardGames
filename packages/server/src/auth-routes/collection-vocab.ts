// Per-user collection vocabularies: sleeve types and statuses.
//
//   POST/PUT/DELETE /api/collection/users/:userId/sleeve-types(/:id)
//   POST/PUT/DELETE /api/collection/users/:userId/statuses(/:id)
//
// Reads ride the collection GET (`collection.ts`); this file is write-only.
// Vocabularies are deliberately per-user (how someone labels and groups
// their shelf is personal), so writes are owner-or-admin — the same rule as
// item edits. Deleting an entry falls back referencing items to NULL via
// the FK's ON DELETE SET NULL.

import { randomUUID } from "node:crypto";
import {
  CollectionOkResponseSchema,
  CreateSleeveTypeBodySchema,
  CreateStatusBodySchema,
  SleeveTypeWriteResponseSchema,
  StatusWriteResponseSchema,
  UpdateSleeveTypeBodySchema,
  UpdateStatusBodySchema,
} from "@boardgames/core/protocol";
import { z } from "zod";
import { authedApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { parseRow } from "../lib/db-rows.ts";
import { errorResponse, zJsonBody } from "../lib/error-response.ts";
import { canEditCollection } from "./collection.ts";

export const collectionVocabRoutes = authedApp();

const SleeveTypeRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  width_mm: z.number().nullable(),
  height_mm: z.number().nullable(),
  brand: z.string().nullable(),
});

const StatusRowSchema = z.object({
  id: z.string(),
  label: z.string(),
  sort_order: z.number(),
});

// ── Sleeve types ───────────────────────────────────────────────────────

collectionVocabRoutes.post(
  "/users/:userId/sleeve-types",
  zJsonBody(CreateSleeveTypeBodySchema),
  async (c) => {
    const userId = c.req.param("userId");
    if (!canEditCollection(c.get("user"), userId)) {
      return errorResponse(c, 403, "cannot edit another member's collection", "FORBIDDEN");
    }
    const body = c.req.valid("json");
    const id = randomUUID();
    await getDb().execute({
      sql: `INSERT INTO sleeve_types (id, user_id, name, width_mm, height_mm, brand)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        userId,
        body.name,
        body.widthMm ?? null,
        body.heightMm ?? null,
        body.brand ?? null,
      ],
    });
    return c.json(
      SleeveTypeWriteResponseSchema.parse({
        ok: true,
        sleeveType: {
          id,
          name: body.name,
          widthMm: body.widthMm ?? null,
          heightMm: body.heightMm ?? null,
          brand: body.brand ?? null,
        },
      }),
    );
  },
);

collectionVocabRoutes.put(
  "/users/:userId/sleeve-types/:id",
  zJsonBody(UpdateSleeveTypeBodySchema),
  async (c) => {
    const userId = c.req.param("userId");
    const id = c.req.param("id");
    if (!canEditCollection(c.get("user"), userId)) {
      return errorResponse(c, 403, "cannot edit another member's collection", "FORBIDDEN");
    }
    const body = c.req.valid("json");
    const db = getDb();
    const { rows } = await db.execute({
      sql: `SELECT id, name, width_mm, height_mm, brand FROM sleeve_types
             WHERE id = ? AND user_id = ? LIMIT 1`,
      args: [id, userId],
    });
    if (rows.length === 0) return errorResponse(c, 404, "sleeve type not found", "NOT_FOUND");
    const current = parseRow(SleeveTypeRowSchema, rows[0], "sleeve_types");

    const next = {
      name: body.name ?? current.name,
      widthMm: body.widthMm !== undefined ? body.widthMm : current.width_mm,
      heightMm: body.heightMm !== undefined ? body.heightMm : current.height_mm,
      brand: body.brand !== undefined ? body.brand : current.brand,
    };
    await db.execute({
      sql: `UPDATE sleeve_types SET name = ?, width_mm = ?, height_mm = ?, brand = ?
             WHERE id = ? AND user_id = ?`,
      args: [next.name, next.widthMm, next.heightMm, next.brand, id, userId],
    });
    return c.json(SleeveTypeWriteResponseSchema.parse({ ok: true, sleeveType: { id, ...next } }));
  },
);

collectionVocabRoutes.delete("/users/:userId/sleeve-types/:id", async (c) => {
  const userId = c.req.param("userId");
  if (!canEditCollection(c.get("user"), userId)) {
    return errorResponse(c, 403, "cannot edit another member's collection", "FORBIDDEN");
  }
  await getDb().execute({
    sql: "DELETE FROM sleeve_types WHERE id = ? AND user_id = ?",
    args: [c.req.param("id"), userId],
  });
  return c.json(CollectionOkResponseSchema.parse({ ok: true }));
});

// ── Statuses ───────────────────────────────────────────────────────────

collectionVocabRoutes.post(
  "/users/:userId/statuses",
  zJsonBody(CreateStatusBodySchema),
  async (c) => {
    const userId = c.req.param("userId");
    if (!canEditCollection(c.get("user"), userId)) {
      return errorResponse(c, 403, "cannot edit another member's collection", "FORBIDDEN");
    }
    const body = c.req.valid("json");
    const id = randomUUID();
    const db = getDb();
    // Default to the end of the user's list; explicit sortOrder wins.
    await db.execute({
      sql: `INSERT INTO collection_statuses (id, user_id, label, sort_order)
            VALUES (?, ?, ?, COALESCE(?,
              (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM collection_statuses WHERE user_id = ?)))`,
      args: [id, userId, body.label, body.sortOrder ?? null, userId],
    });
    const { rows } = await db.execute({
      sql: "SELECT id, label, sort_order FROM collection_statuses WHERE id = ? LIMIT 1",
      args: [id],
    });
    const saved = parseRow(StatusRowSchema, rows[0], "collection_statuses");
    return c.json(
      StatusWriteResponseSchema.parse({
        ok: true,
        status: { id: saved.id, label: saved.label, sortOrder: saved.sort_order },
      }),
    );
  },
);

collectionVocabRoutes.put(
  "/users/:userId/statuses/:id",
  zJsonBody(UpdateStatusBodySchema),
  async (c) => {
    const userId = c.req.param("userId");
    const id = c.req.param("id");
    if (!canEditCollection(c.get("user"), userId)) {
      return errorResponse(c, 403, "cannot edit another member's collection", "FORBIDDEN");
    }
    const body = c.req.valid("json");
    const db = getDb();
    const { rows } = await db.execute({
      sql: "SELECT id, label, sort_order FROM collection_statuses WHERE id = ? AND user_id = ? LIMIT 1",
      args: [id, userId],
    });
    if (rows.length === 0) return errorResponse(c, 404, "status not found", "NOT_FOUND");
    const current = parseRow(StatusRowSchema, rows[0], "collection_statuses");

    const label = body.label ?? current.label;
    const sortOrder = body.sortOrder !== undefined ? body.sortOrder : current.sort_order;
    await db.execute({
      sql: "UPDATE collection_statuses SET label = ?, sort_order = ? WHERE id = ? AND user_id = ?",
      args: [label, sortOrder, id, userId],
    });
    return c.json(StatusWriteResponseSchema.parse({ ok: true, status: { id, label, sortOrder } }));
  },
);

collectionVocabRoutes.delete("/users/:userId/statuses/:id", async (c) => {
  const userId = c.req.param("userId");
  if (!canEditCollection(c.get("user"), userId)) {
    return errorResponse(c, 403, "cannot edit another member's collection", "FORBIDDEN");
  }
  await getDb().execute({
    sql: "DELETE FROM collection_statuses WHERE id = ? AND user_id = ?",
    args: [c.req.param("id"), userId],
  });
  return c.json(CollectionOkResponseSchema.parse({ ok: true }));
});
