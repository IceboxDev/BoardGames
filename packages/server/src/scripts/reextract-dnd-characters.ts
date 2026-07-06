// Re-run character extraction for every ready character whose sheet PDF is
// stored (file_id set), using the current pipeline — picks up fields added
// after the original upload (player name, printed passive perception, the
// 18-skill list, categorized proficiencies). Characters uploaded before
// source storage are skipped and listed. Overwrites the stored sheet, so any
// manual ledger edits to those characters are replaced by the re-read.
//
// Usage (from packages/server; hits the DB in .env — the LIVE one):
//   pnpm exec tsx src/scripts/reextract-dnd-characters.ts

import "../env.ts";
import { getDb, initDb } from "../db.ts";
import { setCharacterReady } from "../lib/dnd-characters-db.ts";
import { extractCharacter } from "../lib/dnd-extract.ts";
import { getFileBase64 } from "../lib/dnd-files-db.ts";

await initDb();

const rows = await getDb().execute(
  `SELECT id, user_id, source_filename, file_id FROM dnd_characters
   WHERE status = 'ready' ORDER BY created_at ASC`,
);

for (const row of rows.rows) {
  const id = String(row.id);
  const filename = String(row.source_filename);
  const fileId = row.file_id;
  if (typeof fileId !== "string") {
    console.log(`SKIP (no stored PDF): ${filename}`);
    continue;
  }
  const base64 = await getFileBase64(fileId, String(row.user_id));
  if (!base64) {
    console.log(`SKIP (missing chunks): ${filename}`);
    continue;
  }
  try {
    const sheet = await extractCharacter(`data:application/pdf;base64,${base64}`, filename);
    await setCharacterReady(id, sheet);
    const perception = sheet.skills.find((s) => s.name === "Perception");
    const pp = perception ? 10 + perception.modifier : "?";
    console.log(
      `OK ${filename}: name=${sheet.name ?? "(none)"} player=${sheet.playerName ?? "(none)"} PP(computed)=${pp} skills=${sheet.skills.length} saves=${sheet.savingThrows.join("/") || "-"}`,
    );
  } catch (err) {
    console.error(`FAIL ${filename}:`, err instanceof Error ? err.message : err);
  }
}

console.log("re-extraction complete");
