// Migration 0020 — cross-link story nodes.
//
// A suggestion branch can now END by linking to an existing node on a
// parallel branch ("Go to Allani" → the curated Allani chain) instead of
// duplicating it. Additive and idempotent.

import type { Migration } from "./types.ts";

export const dndNodeLinks: Migration = {
  version: 20,
  name: "dnd_node_links",
  statements: [`ALTER TABLE dnd_nodes ADD COLUMN link_target_id TEXT`],
};
