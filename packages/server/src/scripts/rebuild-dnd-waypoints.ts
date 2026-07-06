// Rebuild a campaign's waypoints from its stored module PDF using the
// current extraction (module-ordered waypoints + read-aloud arrival text),
// then re-chart the read-aloud node templates against the new waypoint list
// and re-seed each party whose story tree contains only untouched roots
// (trees with DM-grown branches are left alone and flagged — their
// waypoint indexes would be stale).
//
// The module-order guarantee is verified programmatically: any "Area N" /
// "Part N" numbers appearing in waypoint titles must be strictly ascending;
// extraction is retried (up to 3 attempts) until they are.
//
// Usage (from packages/server; hits the DB in .env — the LIVE one):
//   pnpm exec tsx src/scripts/rebuild-dnd-waypoints.ts <campaign-filename-substring>

import "../env.ts";
import { getDb, initDb } from "../db.ts";
import {
  getCampaignFileId,
  listCampaignsForUser,
  setCampaignReady,
} from "../lib/dnd-campaigns-db.ts";
import {
  type CampaignExtraction,
  extractCampaign,
  extractReadAloudNodes,
} from "../lib/dnd-extract.ts";
import { getFileBase64 } from "../lib/dnd-files-db.ts";
import { replaceNodeTemplates, seedPartyFromTemplates } from "../lib/dnd-node-templates-db.ts";
import { listNodesForParty } from "../lib/dnd-nodes-db.ts";
import { listPartiesForCampaign } from "../lib/dnd-parties-db.ts";

const [filenameNeedle] = process.argv.slice(2);
if (!filenameNeedle) {
  console.error("usage: tsx src/scripts/rebuild-dnd-waypoints.ts <campaign-filename-substring>");
  process.exit(1);
}

/** "Area 4: Forgotten Shrine" → 4; "Part 3 — The Dryad's Offer" → 3. */
function enumeratedNumbers(titles: string[]): { label: string; n: number }[] {
  const out: { label: string; n: number }[] = [];
  for (const title of titles) {
    const m = title.match(/\b(?:Area|Part|Chapter)\s+(\d+)/i);
    if (m?.[1]) out.push({ label: title, n: Number(m[1]) });
  }
  return out;
}

function inModuleOrder(titles: string[]): boolean {
  // Areas and Parts are separate sequences; each must be ascending on its own.
  for (const prefix of ["area", "part", "chapter"]) {
    const seq = titles
      .map((t) => t.match(new RegExp(`\\b${prefix}\\s+(\\d+)`, "i")))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => Number(m[1]));
    for (let i = 1; i < seq.length; i++) {
      const current = seq[i];
      const previous = seq[i - 1];
      if (current === undefined || previous === undefined || current <= previous) return false;
    }
  }
  return true;
}

await initDb();

const rows = await getDb().execute({
  sql: `SELECT id, user_id FROM dnd_campaigns
        WHERE status = 'ready' AND source_filename LIKE ?`,
  args: [`%${filenameNeedle}%`],
});
if (rows.rows.length !== 1) {
  console.error(`expected exactly 1 matching campaign, found ${rows.rows.length}`);
  process.exit(1);
}
const campaignId = String(rows.rows[0]?.id);
const userId = String(rows.rows[0]?.user_id);
const campaign = (await listCampaignsForUser(userId)).find((c) => c.id === campaignId);
if (!campaign) throw new Error("campaign not readable back");

const fileId = await getCampaignFileId(campaignId, userId);
if (!fileId) throw new Error("no stored module PDF — run backfill-dnd-from-pdf.ts first");
const base64 = await getFileBase64(fileId, userId);
if (!base64) throw new Error("stored PDF is missing its chunks");
const pdfDataUri = `data:application/pdf;base64,${base64}`;

console.log(`campaign: "${campaign.title}" — recharting waypoints…`);

let extraction: CampaignExtraction | null = null;
for (let attempt = 1; attempt <= 3; attempt++) {
  const candidate = await extractCampaign(pdfDataUri, campaign.sourceFilename);
  const titles = candidate.checkpoints.map((cp) => cp.title);
  if (inModuleOrder(titles)) {
    extraction = candidate;
    break;
  }
  console.log(`attempt ${attempt}: enumerated sections out of order — retrying`);
  console.log(
    `  saw: ${enumeratedNumbers(titles)
      .map((e) => e.label)
      .join(" | ")}`,
  );
}
if (!extraction) {
  console.error("FAIL: 3 attempts, none in module order");
  process.exit(1);
}

console.log(`\nnew waypoints (${extraction.checkpoints.length}):`);
extraction.checkpoints.forEach((cp, i) => {
  console.log(
    `  ${i}: [${cp.kind}] ${cp.title} ${cp.arrivalText ? "(arrival ✓)" : "(NO arrival)"}`,
  );
});

await setCampaignReady(campaignId, extraction);

console.log("\nrecharting read-aloud templates against the new waypoints…");
const blocks = await extractReadAloudNodes(
  pdfDataUri,
  campaign.sourceFilename,
  extraction.checkpoints,
);
await replaceNodeTemplates(campaignId, userId, blocks);
console.log(`templates: ${blocks.length}`);
for (const b of blocks) console.log(`  [wp ${b.waypointIndex}] ${b.trigger}`);

for (const party of await listPartiesForCampaign(campaignId, userId)) {
  const nodes = await listNodesForParty(party.id, userId);
  const onlyRoots = nodes.every((n) => n.parentId === null);
  if (!onlyRoots) {
    console.log(
      `party "${party.name}": tree has DM-grown branches — left untouched (indexes may be stale)`,
    );
    continue;
  }
  await getDb().execute({
    sql: "DELETE FROM dnd_nodes WHERE party_id = ? AND user_id = ?",
    args: [party.id, userId],
  });
  const seeded = await seedPartyFromTemplates(campaignId, party.id, userId);
  console.log(`party "${party.name}": re-seeded ${seeded} roots`);
}

console.log("\nrebuild complete");
