// Migration 0048 — a purchase poll can carry a theme.
//
// The first vote had no stated angle; the second one does ("games for the
// whole table"), and the announcement should say so. Two nullable columns on
// the poll, written once by the admin who opens it and never changed:
//
//   • `title` — the headline the announcement leads with.
//   • `blurb` — a paragraph on why these contenders.
//
// NULL on every poll opened before this migration; readers fall back to the
// generic copy. Purely additive.

import type { Migration } from "./types.ts";

export const purchasePollTheme: Migration = {
  version: 48,
  name: "purchase_poll_theme",
  statements: [
    "ALTER TABLE purchase_polls ADD COLUMN title TEXT",
    "ALTER TABLE purchase_polls ADD COLUMN blurb TEXT",
  ],
};
