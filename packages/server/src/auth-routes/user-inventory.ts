import { ownedCatalogSlugs } from "@boardgames/core/games/ownership";
import { LibraryOwnersResponseSchema, SlugListSchema } from "@boardgames/core/protocol";
import { z } from "zod";
import { authedApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { jsonColumn, parseRow, RowParseError } from "../lib/db-rows.ts";

export const userInventoryRoutes = authedApp();

/** Row projection for `SELECT game_slugs_json FROM user_inventory`. */
const InventoryRowSchema = z.object({
  game_slugs_json: jsonColumn(SlugListSchema),
});

userInventoryRoutes.get("/inventory", async (c) => {
  const user = c.get("user");
  const { rows } = await getDb().execute({
    sql: "SELECT game_slugs_json FROM user_inventory WHERE user_id = ?",
    args: [user.id],
  });
  if (rows.length === 0) return c.json(SlugListSchema.parse([]));
  const { game_slugs_json } = parseRow(InventoryRowSchema, rows[0], "user_inventory");
  return c.json(game_slugs_json);
});

const OwnerRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  image: z.string().nullable(),
});

// Registered members (no guests, no internal accounts) who own at least one
// catalog game, with their derived libraries — backs the /games "Owned by"
// filter. Same visibility as the profile directory, which already exposes
// every member's library.
userInventoryRoutes.get("/inventory/owners", async (c) => {
  const { rows } = await getDb().execute(
    `SELECT u.id, u.name, u.image, i.game_slugs_json
       FROM "user" u JOIN user_inventory i ON i.user_id = u.id
      WHERE u.internal = 0 AND u.guest = 0
      ORDER BY u.name COLLATE NOCASE ASC`,
  );
  const owners = [];
  for (const row of rows) {
    const user = parseRow(OwnerRowSchema, row, "user");
    try {
      const { game_slugs_json } = parseRow(InventoryRowSchema, row, "user_inventory");
      const slugs = [...ownedCatalogSlugs(game_slugs_json)];
      if (slugs.length > 0) owners.push({ id: user.id, name: user.name, image: user.image, slugs });
    } catch (err) {
      if (!(err instanceof RowParseError)) throw err;
    }
  }
  return c.json(LibraryOwnersResponseSchema.parse({ owners }));
});
