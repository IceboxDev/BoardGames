// Migration 0016 — D&D node types + template hierarchy.
//
// • `node_type` on nodes and templates: 'story' (read-aloud + branches) or
//   'initiative' (combat starts — the node opens the initiative tracker
//   instead of a conversation).
// • `parent_sort` on templates: templates now form TREES, not flat root
//   lists — a template's parent is referenced by its sort_order within the
//   same campaign (NULL = a waypoint root). Party seeding reproduces the
//   hierarchy in dnd_nodes.
//
// Additive and idempotent — safe on the live database.

import type { Migration } from "./types.ts";

export const dndNodeTypes: Migration = {
  version: 16,
  name: "dnd_node_types",
  statements: [
    `ALTER TABLE dnd_nodes ADD COLUMN node_type TEXT NOT NULL DEFAULT 'story'`,
    `ALTER TABLE dnd_node_templates ADD COLUMN node_type TEXT NOT NULL DEFAULT 'story'`,
    `ALTER TABLE dnd_node_templates ADD COLUMN parent_sort INTEGER`,
  ],
};
