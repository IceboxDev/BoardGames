// Collection manager routes — per-item metadata over the owned-games list.
//
//   GET  /api/collection/users/:userId                → full collection payload
//   PUT  /api/collection/users/:userId/item           → upsert item metadata
//   POST /api/collection/users/:userId/played-through → destroy/restore a legacy game
//   POST /api/collection/users/:userId/remove         → self-remove (sold/gifted)
//   POST/PUT/DELETE /api/collection/users/:userId/boxes(/:boxId)
//
// Ownership stays in `user_inventory.game_slugs_json`; `collection_items` is
// decoration, lazily materialized on first metadata write. The two writes that
// touch ownership (played-through, remove) rewrite the inventory JSON and the
// item row in one `db.batch(..., "write")`, so ownership readers
// (`expandOwnedSlugs` callers) never see a half-applied state.
//
// Visibility: any member may view any collection; only the owner and admins
// may edit. Private fields (acquired date, price, note) are stripped for
// other viewers, and announcements are omitted entirely.

import { randomUUID } from "node:crypto";
import {
  type Announcement,
  BoxWriteResponseSchema,
  type CollectionItem,
  CollectionOkResponseSchema,
  CollectionResponseSchema,
  CreateBoxBodySchema,
  RemoveOwnedGameBodySchema,
  RemoveOwnedGameResponseSchema,
  SetPlayedThroughBodySchema,
  SetPlayedThroughResponseSchema,
  UpdateBoxBodySchema,
  UpsertItemBodySchema,
  UpsertItemResponseSchema,
} from "@boardgames/core/protocol";
import type { Client, InStatement } from "@libsql/client";
import { z } from "zod";
import { authedApp } from "../auth/index.ts";
import type { AuthUser } from "../auth/types.ts";
import { getDb } from "../db.ts";
import { logActivity } from "../lib/activity-log.ts";
import { jsonColumn, parseRow, parseRows } from "../lib/db-rows.ts";
import { errorResponse, zJsonBody } from "../lib/error-response.ts";
import { withSlugAdded, withSlugRemoved } from "../lib/inventory-slugs.ts";

export const collectionRoutes = authedApp();

// ── Row projections ────────────────────────────────────────────────────

/** Lenient inventory read — a retired slug must not hide the collection. */
const InventoryRowSchema = z.object({
  game_slugs_json: jsonColumn(z.array(z.string())),
});

export const CollectionItemRowSchema = z.object({
  id: z.string(),
  slug: z.string().nullable(),
  custom_title: z.string().nullable(),
  box_id: z.string().nullable(),
  sleeve_status: z.enum(["none", "sleeved", "missing"]),
  sleeve_type_id: z.string().nullable(),
  status_id: z.string().nullable(),
  width_mm: z.number().nullable(),
  depth_mm: z.number().nullable(),
  height_mm: z.number().nullable(),
  weight_g: z.number().nullable(),
  language: z.string().nullable(),
  acquired_on: z.string().nullable(),
  price_paid_cents: z.number().nullable(),
  note: z.string().nullable(),
  played_through_at: z.string().nullable(),
  updated_at: z.string(),
});
type CollectionItemRow = z.infer<typeof CollectionItemRowSchema>;

const StorageBoxRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  note: z.string().nullable(),
});

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

const PlayStatRowSchema = z.object({
  slug: z.string(),
  play_count: z.number(),
  last_played_at: z.string().nullable(),
});

export const AnnouncementRowSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  slug: z.string().nullable(),
  free_text_name: z.string().nullable(),
  note: z.string().nullable(),
  status: z.enum(["pending", "approved", "dismissed"]),
  resolution_slug: z.string().nullable(),
  resolved_by: z.string().nullable(),
  resolved_at: z.string().nullable(),
  created_at: z.string(),
});
type AnnouncementRow = z.infer<typeof AnnouncementRowSchema>;

// ── Shared helpers (also used by the announcement routes) ──────────────

export function canEditCollection(viewer: AuthUser, ownerId: string): boolean {
  return viewer.id === ownerId || viewer.role === "admin";
}

export function rowToItem(row: CollectionItemRow): CollectionItem {
  return {
    id: row.id,
    slug: row.slug,
    customTitle: row.custom_title,
    boxId: row.box_id,
    sleeveStatus: row.sleeve_status,
    sleeveTypeId: row.sleeve_type_id,
    statusId: row.status_id,
    widthMm: row.width_mm,
    depthMm: row.depth_mm,
    heightMm: row.height_mm,
    weightG: row.weight_g,
    language: row.language,
    acquiredOn: row.acquired_on,
    pricePaidCents: row.price_paid_cents,
    note: row.note,
    playedThroughAt: row.played_through_at,
    updatedAt: row.updated_at,
  };
}

export function rowToAnnouncement(row: AnnouncementRow, userName: string | null): Announcement {
  return {
    id: row.id,
    userId: row.user_id,
    userName,
    slug: row.slug,
    freeTextName: row.free_text_name,
    note: row.note,
    status: row.status,
    resolutionSlug: row.resolution_slug,
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
  };
}

/** The user's stored inventory slug list ([] when no row). */
export async function fetchInventorySlugs(db: Client, userId: string): Promise<string[]> {
  const { rows } = await db.execute({
    sql: "SELECT game_slugs_json FROM user_inventory WHERE user_id = ?",
    args: [userId],
  });
  if (rows.length === 0) return [];
  return parseRow(InventoryRowSchema, rows[0], "user_inventory").game_slugs_json;
}

/** Upsert statement persisting a rewritten inventory slug list. */
export function inventoryWriteStatement(userId: string, slugs: readonly string[]): InStatement {
  return {
    sql: `INSERT INTO user_inventory (user_id, game_slugs_json, updated_at)
          VALUES (?, ?, datetime('now'))
          ON CONFLICT(user_id) DO UPDATE SET
            game_slugs_json = excluded.game_slugs_json,
            updated_at = excluded.updated_at`,
    args: [userId, JSON.stringify(slugs)],
  };
}

async function fetchItemRow(
  db: Client,
  userId: string,
  target: { slug: string } | { itemId: string },
): Promise<CollectionItemRow | null> {
  const bySlug = "slug" in target;
  const { rows } = await db.execute({
    sql: `SELECT id, slug, custom_title, box_id, sleeve_status, sleeve_type_id, status_id,
                 width_mm, depth_mm, height_mm, weight_g, language, acquired_on,
                 price_paid_cents, note, played_through_at, updated_at
            FROM collection_items
           WHERE user_id = ? AND ${bySlug ? "slug = ?" : "id = ?"} LIMIT 1`,
    args: [userId, bySlug ? target.slug : target.itemId],
  });
  if (rows.length === 0) return null;
  return parseRow(CollectionItemRowSchema, rows[0], "collection_items");
}

/** Whether a vocab/box row exists AND belongs to this user (FKs don't scope). */
async function belongsToUser(
  db: Client,
  table: "storage_boxes" | "sleeve_types" | "collection_statuses",
  id: string,
  userId: string,
): Promise<boolean> {
  const { rows } = await db.execute({
    sql: `SELECT 1 FROM ${table} WHERE id = ? AND user_id = ? LIMIT 1`,
    args: [id, userId],
  });
  return rows.length > 0;
}

// ── GET /users/:userId ─────────────────────────────────────────────────

collectionRoutes.get("/users/:userId", async (c) => {
  const userId = c.req.param("userId");
  const viewer = c.get("user");
  const editable = canEditCollection(viewer, userId);
  const db = getDb();

  const [userResult, slugs, itemsResult, boxesResult, sleevesResult, statusesResult, playsResult] =
    await Promise.all([
      db.execute({ sql: `SELECT 1 FROM "user" WHERE id = ? LIMIT 1`, args: [userId] }),
      fetchInventorySlugs(db, userId),
      db.execute({
        sql: `SELECT id, slug, custom_title, box_id, sleeve_status, sleeve_type_id, status_id,
                     width_mm, depth_mm, height_mm, weight_g, language, acquired_on,
                     price_paid_cents, note, played_through_at, updated_at
                FROM collection_items WHERE user_id = ? ORDER BY created_at ASC`,
        args: [userId],
      }),
      db.execute({
        sql: "SELECT id, name, note FROM storage_boxes WHERE user_id = ? ORDER BY name COLLATE NOCASE",
        args: [userId],
      }),
      db.execute({
        sql: `SELECT id, name, width_mm, height_mm, brand FROM sleeve_types
               WHERE user_id = ? ORDER BY name COLLATE NOCASE`,
        args: [userId],
      }),
      db.execute({
        sql: `SELECT id, label, sort_order FROM collection_statuses
               WHERE user_id = ? ORDER BY sort_order ASC, label COLLATE NOCASE`,
        args: [userId],
      }),
      db.execute({
        sql: `SELECT m.game_slug AS slug, COUNT(*) AS play_count, MAX(m.played_at) AS last_played_at
                FROM match_results m
                JOIN match_participants p ON p.match_id = m.id
               WHERE p.user_id = ? AND m.game_slug IS NOT NULL
               GROUP BY m.game_slug`,
        args: [userId],
      }),
    ]);
  if (userResult.rows.length === 0) {
    return errorResponse(c, 404, "user not found", "NOT_FOUND");
  }

  let announcements: Announcement[] = [];
  if (editable) {
    const { rows } = await db.execute({
      sql: `SELECT id, user_id, slug, free_text_name, note, status, resolution_slug,
                   resolved_by, resolved_at, created_at
              FROM ownership_announcements WHERE user_id = ?
             ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC
             LIMIT 25`,
      args: [userId],
    });
    announcements = parseRows(AnnouncementRowSchema, rows, "ownership_announcements").map((r) =>
      rowToAnnouncement(r, null),
    );
  }

  const items = parseRows(CollectionItemRowSchema, itemsResult.rows, "collection_items").map(
    (row) => {
      const item = rowToItem(row);
      // Private collection-keeping details stay between the owner and admins.
      return editable ? item : { ...item, acquiredOn: null, pricePaidCents: null, note: null };
    },
  );

  return c.json(
    CollectionResponseSchema.parse({
      ownerId: userId,
      editable,
      slugs,
      items,
      boxes: parseRows(StorageBoxRowSchema, boxesResult.rows, "storage_boxes"),
      sleeveTypes: parseRows(SleeveTypeRowSchema, sleevesResult.rows, "sleeve_types").map((r) => ({
        id: r.id,
        name: r.name,
        widthMm: r.width_mm,
        heightMm: r.height_mm,
        brand: r.brand,
      })),
      statuses: parseRows(StatusRowSchema, statusesResult.rows, "collection_statuses").map((r) => ({
        id: r.id,
        label: r.label,
        sortOrder: r.sort_order,
      })),
      playStats: parseRows(PlayStatRowSchema, playsResult.rows, "match_results.plays").map((r) => ({
        slug: r.slug,
        playCount: r.play_count,
        lastPlayedAt: r.last_played_at,
      })),
      announcements,
    }),
  );
});

// ── PUT /users/:userId/item ────────────────────────────────────────────

collectionRoutes.put("/users/:userId/item", zJsonBody(UpsertItemBodySchema), async (c) => {
  const userId = c.req.param("userId");
  const viewer = c.get("user");
  if (!canEditCollection(viewer, userId)) {
    return errorResponse(c, 403, "cannot edit another member's collection", "FORBIDDEN");
  }
  const body = c.req.valid("json");
  const db = getDb();

  // Explicit union annotation: an inferred ternary type would carry synthesized
  // `slug?: undefined` / `itemId?: undefined` members that defeat `in`-narrowing.
  const target: { slug: string } | { itemId: string } | null =
    body.itemId !== undefined
      ? { itemId: body.itemId }
      : body.slug !== undefined
        ? { slug: body.slug }
        : null;
  if (target === null) {
    // Unreachable past the schema's exactly-one-of refinement.
    return errorResponse(c, 400, "provide exactly one of slug or itemId", "BAD_REQUEST");
  }
  const existing = await fetchItemRow(db, userId, target);
  if ("itemId" in target && !existing) {
    return errorResponse(c, 404, "collection item not found", "NOT_FOUND");
  }
  if ("slug" in target && !existing) {
    // First metadata write for this slug — only meaningful for an owned game.
    const slugs = await fetchInventorySlugs(db, userId);
    if (!slugs.includes(target.slug)) {
      return errorResponse(c, 400, "game is not in this member's collection", "NOT_OWNED");
    }
  }

  // FKs don't scope references to the user; reject cross-user ids explicitly.
  const refChecks: Promise<boolean>[] = [];
  if (body.boxId != null) refChecks.push(belongsToUser(db, "storage_boxes", body.boxId, userId));
  if (body.sleeveTypeId != null) {
    refChecks.push(belongsToUser(db, "sleeve_types", body.sleeveTypeId, userId));
  }
  if (body.statusId != null) {
    refChecks.push(belongsToUser(db, "collection_statuses", body.statusId, userId));
  }
  if ((await Promise.all(refChecks)).includes(false)) {
    return errorResponse(c, 400, "referenced box/sleeve/status does not exist", "BAD_REFERENCE");
  }

  const merged = {
    box_id: body.boxId !== undefined ? body.boxId : (existing?.box_id ?? null),
    sleeve_status: body.sleeveStatus ?? existing?.sleeve_status ?? "none",
    sleeve_type_id:
      body.sleeveTypeId !== undefined ? body.sleeveTypeId : (existing?.sleeve_type_id ?? null),
    status_id: body.statusId !== undefined ? body.statusId : (existing?.status_id ?? null),
    width_mm: body.widthMm !== undefined ? body.widthMm : (existing?.width_mm ?? null),
    depth_mm: body.depthMm !== undefined ? body.depthMm : (existing?.depth_mm ?? null),
    height_mm: body.heightMm !== undefined ? body.heightMm : (existing?.height_mm ?? null),
    weight_g: body.weightG !== undefined ? body.weightG : (existing?.weight_g ?? null),
    language: body.language !== undefined ? body.language : (existing?.language ?? null),
    acquired_on: body.acquiredOn !== undefined ? body.acquiredOn : (existing?.acquired_on ?? null),
    price_paid_cents:
      body.pricePaidCents !== undefined
        ? body.pricePaidCents
        : (existing?.price_paid_cents ?? null),
    note: body.note !== undefined ? body.note : (existing?.note ?? null),
  };
  // Invariant: an unsleeved game carries no sleeve type.
  if (merged.sleeve_status === "none") merged.sleeve_type_id = null;

  const id = existing?.id ?? randomUUID();
  if (existing) {
    await db.execute({
      sql: `UPDATE collection_items SET
              box_id = ?, sleeve_status = ?, sleeve_type_id = ?, status_id = ?,
              width_mm = ?, depth_mm = ?, height_mm = ?, weight_g = ?,
              language = ?, acquired_on = ?, price_paid_cents = ?, note = ?,
              updated_at = datetime('now')
            WHERE id = ? AND user_id = ?`,
      args: [
        merged.box_id,
        merged.sleeve_status,
        merged.sleeve_type_id,
        merged.status_id,
        merged.width_mm,
        merged.depth_mm,
        merged.height_mm,
        merged.weight_g,
        merged.language,
        merged.acquired_on,
        merged.price_paid_cents,
        merged.note,
        id,
        userId,
      ],
    });
  } else {
    await db.execute({
      sql: `INSERT INTO collection_items
              (id, user_id, slug, box_id, sleeve_status, sleeve_type_id, status_id,
               width_mm, depth_mm, height_mm, weight_g, language, acquired_on,
               price_paid_cents, note)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        userId,
        "slug" in target ? target.slug : null,
        merged.box_id,
        merged.sleeve_status,
        merged.sleeve_type_id,
        merged.status_id,
        merged.width_mm,
        merged.depth_mm,
        merged.height_mm,
        merged.weight_g,
        merged.language,
        merged.acquired_on,
        merged.price_paid_cents,
        merged.note,
      ],
    });
  }

  const saved = await fetchItemRow(db, userId, { itemId: id });
  if (!saved) return errorResponse(c, 500, "item write failed", "WRITE_FAILED");
  return c.json(UpsertItemResponseSchema.parse({ ok: true, item: rowToItem(saved) }));
});

// ── POST /users/:userId/played-through ─────────────────────────────────

collectionRoutes.post(
  "/users/:userId/played-through",
  zJsonBody(SetPlayedThroughBodySchema),
  async (c) => {
    const userId = c.req.param("userId");
    const viewer = c.get("user");
    if (!canEditCollection(viewer, userId)) {
      return errorResponse(c, 403, "cannot edit another member's collection", "FORBIDDEN");
    }
    const { slug, playedThrough } = c.req.valid("json");
    const db = getDb();

    const [slugs, existing] = await Promise.all([
      fetchInventorySlugs(db, userId),
      fetchItemRow(db, userId, { slug }),
    ]);
    if (playedThrough && !slugs.includes(slug)) {
      return errorResponse(c, 400, "game is not in this member's collection", "NOT_OWNED");
    }
    if (!playedThrough && existing?.played_through_at == null) {
      return errorResponse(c, 400, "game is not marked played through", "NOT_PLAYED_THROUGH");
    }

    const newSlugs = playedThrough ? withSlugRemoved(slugs, slug) : withSlugAdded(slugs, slug);
    const itemId = existing?.id ?? randomUUID();
    const itemStatement: InStatement = existing
      ? {
          sql: `UPDATE collection_items
                   SET played_through_at = ${playedThrough ? "datetime('now')" : "NULL"},
                       updated_at = datetime('now')
                 WHERE id = ? AND user_id = ?`,
          args: [itemId, userId],
        }
      : {
          sql: `INSERT INTO collection_items (id, user_id, slug, played_through_at)
                VALUES (?, ?, ?, datetime('now'))`,
          args: [itemId, userId, slug],
        };
    // Atomic: the slug leaves/rejoins the inventory in the same transaction
    // that stamps the record, so ownership readers never see a half state.
    await db.batch([inventoryWriteStatement(userId, newSlugs), itemStatement], "write");

    logActivity(userId, "played-through", { slug, playedThrough });

    const saved = await fetchItemRow(db, userId, { itemId });
    if (!saved) return errorResponse(c, 500, "item write failed", "WRITE_FAILED");
    return c.json(
      SetPlayedThroughResponseSchema.parse({ ok: true, slugs: newSlugs, item: rowToItem(saved) }),
    );
  },
);

// ── POST /users/:userId/remove ─────────────────────────────────────────

collectionRoutes.post("/users/:userId/remove", zJsonBody(RemoveOwnedGameBodySchema), async (c) => {
  const userId = c.req.param("userId");
  const viewer = c.get("user");
  if (!canEditCollection(viewer, userId)) {
    return errorResponse(c, 403, "cannot edit another member's collection", "FORBIDDEN");
  }
  const { slug } = c.req.valid("json");
  const db = getDb();

  const slugs = await fetchInventorySlugs(db, userId);
  if (!slugs.includes(slug)) {
    return errorResponse(c, 400, "game is not in this member's collection", "NOT_OWNED");
  }

  const newSlugs = withSlugRemoved(slugs, slug);
  await db.batch(
    [
      inventoryWriteStatement(userId, newSlugs),
      {
        sql: "DELETE FROM collection_items WHERE user_id = ? AND slug = ?",
        args: [userId, slug],
      },
    ],
    "write",
  );
  logActivity(userId, "ownership-removed", { slug, by: viewer.id });

  return c.json(RemoveOwnedGameResponseSchema.parse({ ok: true, slugs: newSlugs }));
});

// ── Boxes ──────────────────────────────────────────────────────────────

collectionRoutes.post("/users/:userId/boxes", zJsonBody(CreateBoxBodySchema), async (c) => {
  const userId = c.req.param("userId");
  const viewer = c.get("user");
  if (!canEditCollection(viewer, userId)) {
    return errorResponse(c, 403, "cannot edit another member's collection", "FORBIDDEN");
  }
  const { name, note } = c.req.valid("json");
  const id = randomUUID();
  await getDb().execute({
    sql: "INSERT INTO storage_boxes (id, user_id, name, note) VALUES (?, ?, ?, ?)",
    args: [id, userId, name, note ?? null],
  });
  return c.json(BoxWriteResponseSchema.parse({ ok: true, box: { id, name, note: note ?? null } }));
});

collectionRoutes.put("/users/:userId/boxes/:boxId", zJsonBody(UpdateBoxBodySchema), async (c) => {
  const userId = c.req.param("userId");
  const boxId = c.req.param("boxId");
  const viewer = c.get("user");
  if (!canEditCollection(viewer, userId)) {
    return errorResponse(c, 403, "cannot edit another member's collection", "FORBIDDEN");
  }
  const body = c.req.valid("json");
  const db = getDb();

  const { rows } = await db.execute({
    sql: "SELECT id, name, note FROM storage_boxes WHERE id = ? AND user_id = ? LIMIT 1",
    args: [boxId, userId],
  });
  if (rows.length === 0) return errorResponse(c, 404, "box not found", "NOT_FOUND");
  const current = parseRow(StorageBoxRowSchema, rows[0], "storage_boxes");

  const name = body.name ?? current.name;
  const note = body.note !== undefined ? body.note : current.note;
  await db.execute({
    sql: "UPDATE storage_boxes SET name = ?, note = ? WHERE id = ? AND user_id = ?",
    args: [name, note, boxId, userId],
  });
  return c.json(BoxWriteResponseSchema.parse({ ok: true, box: { id: boxId, name, note } }));
});

collectionRoutes.delete("/users/:userId/boxes/:boxId", async (c) => {
  const userId = c.req.param("userId");
  const boxId = c.req.param("boxId");
  const viewer = c.get("user");
  if (!canEditCollection(viewer, userId)) {
    return errorResponse(c, 403, "cannot edit another member's collection", "FORBIDDEN");
  }
  // Items referencing the box fall back to unassigned via ON DELETE SET NULL.
  await getDb().execute({
    sql: "DELETE FROM storage_boxes WHERE id = ? AND user_id = ?",
    args: [boxId, userId],
  });
  return c.json(CollectionOkResponseSchema.parse({ ok: true }));
});
