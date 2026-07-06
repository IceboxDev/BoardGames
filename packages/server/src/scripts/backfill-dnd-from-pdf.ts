// Backfill a D&D campaign from a local module PDF:
//   • store the PDF (dnd_files chunks) and link it to the campaign,
//   • (re-)extract the NPC cards,
//   • extract the module's read-aloud blocks into node templates,
//   • seed every existing party's story tree from those templates (only
//     parties whose tree is still empty — never clobbers played sessions).
//
// For campaigns uploaded before source storage / templates existed.
// Usage (from packages/server; hits the DB in .env — the LIVE one):
//   pnpm exec tsx src/scripts/backfill-dnd-from-pdf.ts <pdf-path> <campaign-filename-substring>

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import "../env.ts";
import { getDb, initDb } from "../db.ts";
import {
  getCampaignFileId,
  listCampaignsForUser,
  setCampaignFile,
} from "../lib/dnd-campaigns-db.ts";
import { extractNpcs, extractReadAloudNodes } from "../lib/dnd-extract.ts";
import { insertFile } from "../lib/dnd-files-db.ts";
import { replaceNodeTemplates, seedPartyFromTemplates } from "../lib/dnd-node-templates-db.ts";
import { listNodesForParty } from "../lib/dnd-nodes-db.ts";
import { deleteNpcsForCampaign, insertNpcs, listNpcsForCampaign } from "../lib/dnd-npcs-db.ts";
import { listPartiesForCampaign } from "../lib/dnd-parties-db.ts";

const [pdfPath, filenameNeedle] = process.argv.slice(2);
if (!pdfPath || !filenameNeedle) {
  console.error(
    "usage: tsx src/scripts/backfill-dnd-from-pdf.ts <pdf-path> <campaign-filename-substring>",
  );
  process.exit(1);
}

await initDb();

// Locate the campaign (any user) whose source filename matches.
const rows = await getDb().execute({
  sql: `SELECT id, user_id, source_filename FROM dnd_campaigns
        WHERE status = 'ready' AND source_filename LIKE ?`,
  args: [`%${filenameNeedle}%`],
});
if (rows.rows.length !== 1) {
  console.error(`expected exactly 1 matching campaign, found ${rows.rows.length}:`);
  for (const r of rows.rows) console.error(`  ${r.id} ${r.source_filename}`);
  process.exit(1);
}
const campaignRow = rows.rows[0];
const campaignId = String(campaignRow?.id);
const userId = String(campaignRow?.user_id);

const campaign = (await listCampaignsForUser(userId)).find((c) => c.id === campaignId);
if (!campaign) throw new Error("campaign not readable back");
console.log(`campaign: "${campaign.title}" (${campaignId})`);
console.log(`waypoints: ${campaign.checkpoints.length}`);

// 1. Store the PDF (if not already stored) and link it.
const pdfBytes = await readFile(pdfPath);
const base64 = pdfBytes.toString("base64");
const pdfDataUri = `data:application/pdf;base64,${base64}`;
const existingFileId = await getCampaignFileId(campaignId, userId);
if (existingFileId) {
  console.log(`module PDF already stored (${existingFileId})`);
} else {
  const fileId = await insertFile({
    userId,
    campaignId,
    kind: "module",
    filename: campaign.sourceFilename || basename(pdfPath),
    base64,
    sizeBytes: pdfBytes.length,
  });
  await setCampaignFile(campaignId, fileId);
  console.log(`stored module PDF as ${fileId} (${pdfBytes.length} bytes)`);
}

// 2. NPCs + read-aloud blocks, in parallel (independent reads of the PDF).
console.log("extracting NPCs + read-aloud blocks (this takes a few minutes)…");
const [npcs, blocks] = await Promise.all([
  extractNpcs(pdfDataUri, campaign.sourceFilename),
  extractReadAloudNodes(pdfDataUri, campaign.sourceFilename, campaign.checkpoints),
]);

const previousNpcs = (await listNpcsForCampaign(campaignId, userId)).length;
await deleteNpcsForCampaign(campaignId, userId);
await insertNpcs(campaignId, userId, npcs);
console.log(`NPCs: ${previousNpcs} → ${npcs.length}`);
for (const npc of npcs) console.log(`  • ${npc.name} — ${npc.role}`);

await replaceNodeTemplates(campaignId, userId, blocks);
console.log(`read-aloud templates: ${blocks.length}`);
for (const b of blocks) console.log(`  • [wp ${b.waypointIndex}] ${b.trigger}`);

// 3. Seed existing parties whose trees are still empty.
for (const party of await listPartiesForCampaign(campaignId, userId)) {
  const existing = await listNodesForParty(party.id, userId);
  if (existing.length > 0) {
    console.log(`party "${party.name}": tree already has ${existing.length} nodes — skipped`);
    continue;
  }
  const seeded = await seedPartyFromTemplates(campaignId, party.id, userId);
  console.log(`party "${party.name}": seeded ${seeded} roots`);
}

console.log("backfill complete");
