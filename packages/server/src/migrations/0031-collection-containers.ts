// Migration 0031 — "stored inside" containers replace abstract storage boxes.
//
// The original Games Manager modeled physical grouping as user-named
// `storage_boxes` ("Kallax shelf 3"). What the group actually wanted is
// expansion-style packing: all Codenames games live in THE Codenames box —
// the container is another owned game, not a labelled crate.
//
// `container_key` soft-references the container row's list key: a slug for
// slug-backed games, a `collection_items.id` for custom items. Deliberately
// FK-free (a slug is not a row); ownership and single-level nesting are
// enforced at the API boundary, and the remove flow NULLs children in the
// same batch. `storage_boxes` and `collection_items.box_id` stay dormant —
// shipped columns are cheaper to strand than to rebuild away, and no prod
// data ever reached them.

import type { Migration } from "./types.ts";

export const collectionContainers: Migration = {
  version: 31,
  name: "collection_containers",
  statements: ["ALTER TABLE collection_items ADD COLUMN container_key TEXT"],
};
