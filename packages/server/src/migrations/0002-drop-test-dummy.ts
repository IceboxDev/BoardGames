// Migration 0002 — drop the leftover `test_dummy` table.
//
// `test_dummy (id INTEGER PRIMARY KEY)` was scratch/probe junk that ended up in
// production (0 rows). It is not part of the application schema, so the baseline
// (v1) intentionally does not create it. This migration removes it so production
// converges to the canonical schema and fresh databases match production exactly.
//
// `IF EXISTS` keeps it a no-op on databases that never had the table (every fresh
// database, and any environment already cleaned).

import type { Migration } from "./types.ts";

export const dropTestDummy: Migration = {
  version: 2,
  name: "drop_test_dummy",
  statements: ["DROP TABLE IF EXISTS test_dummy"],
};
