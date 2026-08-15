// Migration 0029 — collection manager (per-item game metadata).
//
// `user_inventory.game_slugs_json` stays the single source of truth for WHAT
// is owned; these tables only *decorate* owned games with collection-keeping
// detail. `collection_items` rows are lazily materialized on first metadata
// write — no backfill — so an item row's absence means "owned, nothing noted
// yet", and a row whose slug has left the inventory is either a played-through
// record (`played_through_at` set) or a custom free-text item (`slug` NULL,
// `custom_title` set, created by an admin approving a non-catalog
// announcement).
//
// Sleeve types and statuses are deliberately PER-USER vocabularies: how a
// person groups and labels their collection is personal, so there is no shared
// table and no seeded rows (the client offers one-click suggested defaults
// instead). Slug columns stay CHECK-free like everywhere else so catalog
// growth never needs a table rebuild; exactly-one-of slug/custom_title is
// enforced at the API boundary.

import type { Migration } from "./types.ts";

export const collectionManager: Migration = {
  version: 29,
  name: "collection_manager",
  statements: [
    `CREATE TABLE IF NOT EXISTS storage_boxes (
       id TEXT PRIMARY KEY,
       user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
       name TEXT NOT NULL,
       note TEXT,
       created_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
    "CREATE INDEX IF NOT EXISTS idx_storage_boxes_user ON storage_boxes(user_id)",
    `CREATE TABLE IF NOT EXISTS sleeve_types (
       id TEXT PRIMARY KEY,
       user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
       name TEXT NOT NULL,
       width_mm INTEGER,
       height_mm INTEGER,
       brand TEXT,
       created_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
    "CREATE INDEX IF NOT EXISTS idx_sleeve_types_user ON sleeve_types(user_id)",
    `CREATE TABLE IF NOT EXISTS collection_statuses (
       id TEXT PRIMARY KEY,
       user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
       label TEXT NOT NULL,
       sort_order INTEGER NOT NULL DEFAULT 0,
       created_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
    "CREATE INDEX IF NOT EXISTS idx_collection_statuses_user ON collection_statuses(user_id)",
    `CREATE TABLE IF NOT EXISTS collection_items (
       id TEXT PRIMARY KEY,
       user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
       slug TEXT,
       custom_title TEXT,
       box_id TEXT REFERENCES storage_boxes(id) ON DELETE SET NULL,
       sleeve_status TEXT NOT NULL DEFAULT 'none',
       sleeve_type_id TEXT REFERENCES sleeve_types(id) ON DELETE SET NULL,
       status_id TEXT REFERENCES collection_statuses(id) ON DELETE SET NULL,
       width_mm INTEGER,
       depth_mm INTEGER,
       height_mm INTEGER,
       weight_g INTEGER,
       language TEXT,
       acquired_on TEXT,
       price_paid_cents INTEGER,
       note TEXT,
       played_through_at TEXT,
       created_at TEXT NOT NULL DEFAULT (datetime('now')),
       updated_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
    "CREATE INDEX IF NOT EXISTS idx_collection_items_user ON collection_items(user_id)",
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_items_user_slug
       ON collection_items(user_id, slug) WHERE slug IS NOT NULL`,
  ],
};
