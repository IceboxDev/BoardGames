// Migration 0039 — arrivals: "the games from the purchase vote are here".
//
// A purchase poll closing is silent for members. The celebration is an
// ARRIVAL an admin publishes once the boxes physically exist: which closed
// poll, one to three of its candidates, who bought each, and a real-world
// photo of each. Publishing also stamps every game onto its purchaser's
// `user_inventory` in the same batch (see auth-routes/admin-arrivals.ts).
//
// `purchase_arrivals.id` is a client-minted uuid (like `collection_items`)
// so one write batch can reference it from every statement without a
// RETURNING round-trip. Arrivals are immutable — retract is a hard delete,
// republish mints a new id — which is what lets the photo route answer with
// a forever cache header.
//
// The photo is stored as a webp data URI in TEXT, the same form as
// `user.image`: a handful of ~300 KB photos a year does not justify the
// repo's first BLOB column, and every reader stays on the string-typed row
// schemas. Only the photo route ever SELECTs it. `photo_placeholder` is a
// 24×30 blurred stand-in inlined into the greeting for instant paint.
//
// `purchase_arrival_seen` makes the takeover one-shot per member.
// `purchase_poll_seen.result_seen_at` (0036) is dormant from here on: the
// winner-reveal greeting it powered is gone, and dropping a column is a
// table rebuild that buys nothing.
//
// ON DELETE CASCADE: games and seen-state die with the arrival, with the
// poll, and with the purchaser's account; `published_by` is SET NULL like
// `ownership_announcements.resolved_by`.

import type { Migration } from "./types.ts";

export const purchaseArrivals: Migration = {
  version: 39,
  name: "purchase_arrivals",
  statements: [
    `CREATE TABLE IF NOT EXISTS purchase_arrivals (
       id TEXT PRIMARY KEY,
       poll_id INTEGER NOT NULL REFERENCES purchase_polls(id) ON DELETE CASCADE,
       published_at TEXT NOT NULL DEFAULT (datetime('now')),
       published_by TEXT REFERENCES "user"(id) ON DELETE SET NULL
     )`,
    "CREATE INDEX IF NOT EXISTS idx_purchase_arrivals_poll ON purchase_arrivals(poll_id)",
    `CREATE TABLE IF NOT EXISTS purchase_arrival_games (
       arrival_id TEXT NOT NULL REFERENCES purchase_arrivals(id) ON DELETE CASCADE,
       slug TEXT NOT NULL,
       position INTEGER NOT NULL,
       purchaser_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
       photo TEXT NOT NULL,
       photo_placeholder TEXT NOT NULL,
       photo_w INTEGER NOT NULL,
       photo_h INTEGER NOT NULL,
       photo_bytes INTEGER NOT NULL,
       PRIMARY KEY (arrival_id, slug)
     )`,
    `CREATE TABLE IF NOT EXISTS purchase_arrival_seen (
       arrival_id TEXT NOT NULL REFERENCES purchase_arrivals(id) ON DELETE CASCADE,
       user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
       seen_at TEXT NOT NULL DEFAULT (datetime('now')),
       PRIMARY KEY (arrival_id, user_id)
     )`,
  ],
};
