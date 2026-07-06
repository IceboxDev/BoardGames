// One-off: precompute the combat action dashboard for every ready character
// that doesn't have one cached yet. New/edited characters get theirs at
// extraction time; this backfills the rows that predate that.
//
//   pnpm --filter @boardgames/server exec tsx src/scripts/precompute-action-cards.ts

import "../env.ts";
import { getDb, initDb } from "../db.ts";
import { generateActionCards } from "../lib/dnd-extract.ts";

await initDb();

const result = await getDb().execute(
  `SELECT id, source_filename, sheet_json FROM dnd_characters
   WHERE status = 'ready' AND sheet_json IS NOT NULL AND actions_json IS NULL`,
);
console.log(`${result.rows.length} character(s) missing action cards`);

for (const row of result.rows) {
  const label = `${row.source_filename} (${row.id})`;
  try {
    const cards = await generateActionCards(String(row.sheet_json));
    await getDb().execute({
      sql: "UPDATE dnd_characters SET actions_json = ? WHERE id = ?",
      args: [JSON.stringify(cards), row.id],
    });
    console.log(`✓ ${label}: ${cards.length} cards — ${cards.map((c) => c.name).join(", ")}`);
  } catch (err) {
    console.error(`✗ ${label}:`, err instanceof Error ? err.message : err);
  }
}
console.log("done");
process.exit(0);
