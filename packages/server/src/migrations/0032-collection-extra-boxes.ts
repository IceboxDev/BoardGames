// Migration 0032 — multi-box games.
//
// Some games physically span more than one box (Pandemic ships as two,
// Exploding Kittens base + Zombie Kittens, 7 Wonders base + expansions box).
// The primary box keeps the existing width/depth/height columns;
// `extra_boxes_json` holds the rest as a JSON array of
// `{label, widthMm, depthMm, heightMm}` — display data with no relational
// meaning, so a JSON column beats a child table. NULL = single-box game.

import type { Migration } from "./types.ts";

export const collectionExtraBoxes: Migration = {
  version: 32,
  name: "collection_extra_boxes",
  statements: ["ALTER TABLE collection_items ADD COLUMN extra_boxes_json TEXT"],
};
