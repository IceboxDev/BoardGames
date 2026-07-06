// Migration 0017 — escalation tables on story nodes.
//
// Modules attach reinforcement tables to encounters ("Further Danger — on
// initiative count 20, roll 1d6 on the table below…"). Initiative nodes and
// their templates now carry that table as JSON so the tracker can offer the
// roll and seat the result. Additive and idempotent — safe on the live DB.

import type { Migration } from "./types.ts";

export const dndDangerTables: Migration = {
  version: 17,
  name: "dnd_danger_tables",
  statements: [
    `ALTER TABLE dnd_nodes ADD COLUMN danger_table_json TEXT`,
    `ALTER TABLE dnd_node_templates ADD COLUMN danger_table_json TEXT`,
  ],
};
