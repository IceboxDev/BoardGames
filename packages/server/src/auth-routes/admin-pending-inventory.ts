import {
  OnlineModeSchema,
  PendingInventorySchema,
  PendingInventoryWriteResponseSchema,
  SetPendingInventoryBodySchema,
  SlugListSchema,
} from "@boardgames/core/protocol";
import { z } from "zod";
import { adminApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { jsonColumn, parseRow } from "../lib/db-rows.ts";
import { zJsonBody } from "../lib/error-response.ts";

export const adminPendingInventoryRoutes = adminApp();

/** Row projection for `SELECT game_slugs_json, online_mode FROM pending_inventory`. */
const PendingInventoryRowSchema = z.object({
  game_slugs_json: jsonColumn(SlugListSchema),
  online_mode: OnlineModeSchema,
});

// GET /pending-inventory — returns the queued slugs + onlineMode that will be
// stamped onto the next signup. When no row exists the queue is "empty":
// no slugs, default mode.
adminPendingInventoryRoutes.get("/pending-inventory", async (c) => {
  const { rows } = await getDb().execute(
    "SELECT game_slugs_json, online_mode FROM pending_inventory WHERE id = 1",
  );
  if (rows.length === 0) {
    return c.json(PendingInventorySchema.parse({ slugs: [], onlineMode: "offline" }));
  }
  const { game_slugs_json, online_mode } = parseRow(
    PendingInventoryRowSchema,
    rows[0],
    "pending_inventory",
  );
  return c.json(PendingInventorySchema.parse({ slugs: game_slugs_json, onlineMode: online_mode }));
});

// PUT /pending-inventory — admin saves the queue. The row is deleted only when
// BOTH slugs are empty AND onlineMode is the default 'offline'; otherwise it's
// upserted. That way an admin can preset just the mode (no games) or just the
// games (default mode) without one wiping the other.
adminPendingInventoryRoutes.put(
  "/pending-inventory",
  zJsonBody(SetPendingInventoryBodySchema),
  async (c) => {
    const { slugs, onlineMode } = c.req.valid("json");
    const unique = Array.from(new Set(slugs));

    if (unique.length === 0 && onlineMode === "offline") {
      await getDb().execute("DELETE FROM pending_inventory WHERE id = 1");
      return c.json(
        PendingInventoryWriteResponseSchema.parse({
          ok: true,
          slugs: [],
          onlineMode: "offline",
        }),
      );
    }

    await getDb().execute({
      sql: `INSERT INTO pending_inventory (id, game_slugs_json, online_mode, updated_at)
            VALUES (1, ?, ?, datetime('now'))
            ON CONFLICT(id) DO UPDATE SET
              game_slugs_json = excluded.game_slugs_json,
              online_mode = excluded.online_mode,
              updated_at = excluded.updated_at`,
      args: [JSON.stringify(unique), onlineMode],
    });

    return c.json(
      PendingInventoryWriteResponseSchema.parse({
        ok: true,
        slugs: unique,
        onlineMode,
      }),
    );
  },
);
