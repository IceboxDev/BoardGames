// Migration 0028 — traditional-deck card games are owned via the deck.
//
// Durak, Rummy, Kings in the Corner, and Schafkopf stop being individually
// ownable: what a person actually has on the shelf is a deck of cards, and the
// deck determines which games they can host. Inventories now store one of two
// pseudo-slugs from `@boardgames/core/games/card-decks` —
// `deck-french-suited` (unlocks Durak / Rummy / Kings in the Corner) and
// `deck-bavarian-suited` (Schafkopf uses Eichel/Gras/Herz/Schellen cards) —
// and `withDeckGames` derives the games everywhere ownership is read.
//
// This rewrites existing `user_inventory` and `pending_inventory` rows in
// place: each stored card-game slug collapses into its deck slug, deduped via
// json_group_array(DISTINCT …). `game_requests` and `match_results` keep the
// real game slugs — votes and history are about games, not decks.
//
// Data-only; no schema change. Same shape as 0022 (villainous_split).

import type { Migration } from "./types.ts";

const REWRITE = (table: string) => `
  UPDATE ${table}
     SET game_slugs_json = (
       SELECT json_group_array(DISTINCT CASE value
         WHEN 'durak' THEN 'deck-french-suited'
         WHEN 'rummy' THEN 'deck-french-suited'
         WHEN 'kings-in-the-corner' THEN 'deck-french-suited'
         WHEN 'schafkopf' THEN 'deck-bavarian-suited'
         ELSE value END)
         FROM json_each(${table}.game_slugs_json)
     )
   WHERE EXISTS (
     SELECT 1 FROM json_each(${table}.game_slugs_json)
      WHERE value IN ('durak', 'rummy', 'kings-in-the-corner', 'schafkopf')
   )`;

export const cardDeckInventory: Migration = {
  version: 28,
  name: "card_deck_inventory",
  statements: [REWRITE("user_inventory"), REWRITE("pending_inventory")],
};
