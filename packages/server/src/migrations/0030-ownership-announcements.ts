// Migration 0030 — "announce new ownership" queue.
//
// The only self-service way to ADD an owned game: a member announces an
// acquisition (an ownable slug picked from the catalog/EXIT-box/deck list, or
// a free-text name for a game the site doesn't know yet) and an admin
// resolves it — approve (slug appended to `user_inventory`), approve-custom
// (free-text becomes a `collection_items` row with `slug` NULL), or dismiss.
// `resolution_slug` records what was actually stamped, which may differ from
// the announced slug (e.g. the admin maps a free-text name onto a catalog
// entry). Exactly-one-of slug/free_text_name is enforced at the API boundary;
// slug columns stay CHECK-free per house convention.

import type { Migration } from "./types.ts";

export const ownershipAnnouncements: Migration = {
  version: 30,
  name: "ownership_announcements",
  statements: [
    `CREATE TABLE IF NOT EXISTS ownership_announcements (
       id TEXT PRIMARY KEY,
       user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
       slug TEXT,
       free_text_name TEXT,
       note TEXT,
       status TEXT NOT NULL DEFAULT 'pending',
       resolution_slug TEXT,
       resolved_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
       resolved_at TEXT,
       created_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
    "CREATE INDEX IF NOT EXISTS idx_ownership_announcements_status ON ownership_announcements(status)",
    "CREATE INDEX IF NOT EXISTS idx_ownership_announcements_user ON ownership_announcements(user_id)",
  ],
};
