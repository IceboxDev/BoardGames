// One-off: stamp canonical `creatures` onto the live wp0 initiative node's
// danger table (hand-authored — no re-extraction). Idempotent.
//
//   pnpm --filter @boardgames/server exec tsx src/scripts/backfill-danger-creatures.ts

import "../env.ts";
import { DangerTableSchema } from "@boardgames/core/protocol";
import { getDb, initDb } from "../db.ts";

await initDb();

const CREATURES: Record<string, { name: string; count: string }[]> = {
  "1": [{ name: "Swarm of Wasps", count: "1d4" }],
  "2": [{ name: "Wolf", count: "2" }],
  "3": [{ name: "Vulture", count: "1d6" }],
  "4": [{ name: "Panther", count: "2" }],
  "5": [{ name: "Giant Spider", count: "1" }],
  "6": [{ name: "Giant Goat", count: "1" }],
};

const result = await getDb().execute(
  `SELECT id, danger_table_json FROM dnd_nodes WHERE node_type = 'initiative' AND danger_table_json IS NOT NULL`,
);

for (const row of result.rows) {
  const table = DangerTableSchema.parse(JSON.parse(String(row.danger_table_json)));
  let touched = false;
  for (const entry of table.entries) {
    const creatures = CREATURES[entry.roll];
    if (creatures && entry.creatures.length === 0) {
      entry.creatures = creatures;
      touched = true;
    }
  }
  if (!touched) {
    console.log(`node ${row.id}: already has creatures, skipped`);
    continue;
  }
  await getDb().execute({
    sql: `UPDATE dnd_nodes SET danger_table_json = ? WHERE id = ?`,
    args: [JSON.stringify(table), row.id],
  });
  console.log(`node ${row.id}: creatures backfilled (${table.entries.length} entries)`);
}
console.log("done");
process.exit(0);
