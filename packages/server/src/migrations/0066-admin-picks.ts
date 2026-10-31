// Migration 0066 — a private night can be "admin picks".
//
// Private nights had two pick modes in `pick_mode`: 'group' (the seated
// players vote) and 'host' (the host curates). The third, 'admin' (the admins
// curate; the host's own picks don't count), can't widen 0041's CHECK in
// place: SQLite can't alter a CHECK, libSQL's ALTER COLUMN mangles it, and a
// rebuild would DROP a table other tables reference. So it is one additive
// flag: `admin_picks = 1` marks an admin-picks night, whose `pick_mode` is
// written as 'host' — the nearest old meaning — so a server still on the
// previous code during a deploy reads it as a curated night. Schema-only.

import type { Migration } from "./types.ts";

export const adminPicks: Migration = {
  version: 66,
  name: "admin_picks",
  statements: [
    "ALTER TABLE locked_dates ADD COLUMN admin_picks INTEGER NOT NULL DEFAULT 0 CHECK (admin_picks IN (0,1))",
  ],
};
