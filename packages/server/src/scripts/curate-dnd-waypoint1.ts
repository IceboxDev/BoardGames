// One-off curation for "The Wound of the Forest": re-extract the node
// templates with the hierarchical pipeline (short triggers, initiative
// nodes, no arrival duplicates), then REPLACE waypoint 0's blocks with the
// DM's hand-authored tree — the module's crossroads fight as an initiative
// root, and the homebrew Merrick city tour (Copper Kettle, Greenspan's,
// Pixie's Take, Iron & Oath) leading to Allani's house, which the extraction
// cannot know about. Finally re-seed parties whose trees are untouched.
//
// Usage (from packages/server; hits the DB in .env — the LIVE one):
//   pnpm exec tsx src/scripts/curate-dnd-waypoint1.ts

import "../env.ts";
import { getDb, initDb } from "../db.ts";
import { getCampaignFileId, listCampaignsForUser } from "../lib/dnd-campaigns-db.ts";
import { extractReadAloudNodes, type ReadAloudBlock } from "../lib/dnd-extract.ts";
import { getFileBase64 } from "../lib/dnd-files-db.ts";
import { replaceNodeTemplates, seedPartyFromTemplates } from "../lib/dnd-node-templates-db.ts";
import { listNodesForParty } from "../lib/dnd-nodes-db.ts";
import { listPartiesForCampaign } from "../lib/dnd-parties-db.ts";

// ── The hand-authored waypoint 0 tree ──────────────────────────────────
// parentIndex is relative to THIS array; the composer offsets it later.
const WAYPOINT_0: ReadAloudBlock[] = [
  {
    waypointIndex: 0,
    parentIndex: null,
    nodeType: "initiative",
    dangerTable: {
      die: "1d6",
      description:
        "Further Danger (optional): during the second round of combat, on initiative count 20, roll once to introduce another threat spurred on by the spirit of Fossmoor.",
      entries: [
        { roll: "1", text: "1d4 angry swarms of wasps" },
        { roll: "2", text: "two wolves on the prowl" },
        { roll: "3", text: "1d6 vultures that swoop in, hoping for a bit of fresh meat" },
        { roll: "4", text: "a pair of panthers trying to one-up each other" },
        { roll: "5", text: "a giant spider crawling from its lair beneath the big rock" },
        { roll: "6", text: "an incredibly surly giant goat" },
      ],
    },
    trigger: "Roll initiative",
    summary: "Three dead vines attack the crossroads.",
    readText:
      "The three tangles of blackened vine turn as one — thorned limbs rising, sap hissing where it strikes the broken cobbles. They lunge at the closest living things, and they will not stop until they are destroyed.\n\nSteel out — roll initiative.",
  },
  {
    waypointIndex: 0,
    parentIndex: null,
    nodeType: "story",
    dangerTable: null,
    trigger: "Go deeper into the city",
    summary: "Merrick's streets: taverns, outfitters, a smithy, and stranger shops.",
    readText:
      "Merrick is no sprawling metropolis, but it is large enough that you can find nearly anything a traveling party might need: smiths, an herbalist, outfitters, small shrines, inns — and taverns, of course.\n\nA few places catch your eye quickly:\n\nThe Copper Kettle, a loud, warm tavern full of merchants, guards, and travelers. It smells of beer, fried onions, and wet leather.\n\nGreenspan's Supplies, a cramped shop of rope, rations, lanterns, oil, hunting knives, blankets — everything one needs when foolishly walking into a murderous forest.\n\nIron & Oath, the city smithy, hammer blows ringing through its open doors.\n\nAnd a little way down the street: The Pixie's Take. A narrow shop with a violet-painted door, colorful glass windows, and a sign showing a grinning pixie stealing a coin. Presumably a purveyor of magical wares — if you have the gold.\n\nAnd near the heart of the city waits the narrow house of Allani Xiltres, a shining white tower painted above its door.",
  },
  {
    waypointIndex: 0,
    parentIndex: 1,
    nodeType: "story",
    dangerTable: null,
    trigger: "Enter The Copper Kettle",
    summary: "A loud, warm tavern — and the city's rumor mill.",
    readText:
      "Warmth and noise wash over you as the door swings open. Merchants argue prices, off-duty guards hunch over tankards, and a harried barmaid navigates it all with four mugs in each hand. Every third conversation you catch circles back to the same word: Fossmoor — and it is always spoken a little too quietly.",
  },
  {
    waypointIndex: 0,
    parentIndex: 1,
    nodeType: "story",
    dangerTable: null,
    trigger: "Browse Greenspan's Supplies",
    summary: "Expedition gear stacked to the rafters; the owner knows why you're buying.",
    readText:
      'The shop is so cramped you have to turn sideways between the shelves. Coils of rope, bundled torches, oilskins, iron rations, hunting knives, and blankets are stacked to the rafters. The wiry old man behind the counter sizes you up over his spectacles. "Headed toward the forest, are you," he says. It is not a question, and he is already reaching for the rope.',
  },
  {
    waypointIndex: 0,
    parentIndex: 1,
    nodeType: "story",
    dangerTable: null,
    trigger: "Enter The Pixie's Take",
    summary: "A narrow shop of curios and minor enchantments — at proud prices.",
    readText:
      'A bell of colored glass chimes as you step through the violet door. The shop is barely wider than a corridor, its shelves crowded with trinkets that glimmer a touch too eagerly: wax-sealed vials, copper charms, a hand mirror that reflects the room a half-second late. Behind the counter, a small woman with sharp features grins exactly like the pixie on the sign outside. "Everything\'s for sale," she says, "and nothing is cheap."',
  },
  {
    waypointIndex: 0,
    parentIndex: 1,
    nodeType: "story",
    dangerTable: null,
    trigger: "Visit Iron & Oath",
    summary: "The city smithy — honest steel, mended mail, and a warning.",
    readText:
      'Heat rolls out of Iron & Oath\'s open doors, and each hammer blow lands like a slow heartbeat. Racks of fresh-forged blades and mended mail wait for owners brave or foolish enough to need them. The smith — a broad woman with singed eyebrows — glances up between strikes. "If you\'re going where I think you\'re going," she says, "buy the second-best sword too. The forest keeps the first ones."',
  },
  {
    waypointIndex: 0,
    parentIndex: 1,
    nodeType: "story",
    dangerTable: null,
    trigger: "Go to Allani's house",
    summary: "A narrow two-story home marked with the White Tower's icon.",
    readText:
      "You find Allani Xiltres's home near the heart of the city: a narrow, two-story wooden building crowded by the surrounding residences. Above the brass knocker on her front door is painted a palm-sized icon of a shining tower — the symbol of her sect.",
  },
  {
    waypointIndex: 0,
    parentIndex: 6,
    nodeType: "story",
    dangerTable: null,
    trigger: "Knock",
    summary: "Allani answers and hurries the party inside.",
    readText:
      'A stout woman wearing an ankle-length robe of white and green pulls open the door. She appears to be in her mid-60s, with round eyes that peek over the large spectacles that sit low on her nose. Her brown hair is streaked with gray and piled atop her head in a messy bun. She looks you over and lets out a low whistle. "Please, come inside," she says hurriedly. "Did you see the commotion at the crossroads? We have much to discuss."',
  },
  {
    waypointIndex: 0,
    parentIndex: 7,
    nodeType: "story",
    dangerTable: null,
    trigger: "Go in",
    summary: "Tea, lavender, and the job: escort Allani to Admjir.",
    readText:
      "Allani's home smells strongly of lavender. Eclectic pieces of furniture, a few too many for the space, and a low-burning hearth give the dwelling a cozy feel. Before any serious matters are discussed, Allani offers you tea, pouring a cup for herself — she has a habit of sipping it loudly.\n\n\"Thank you for joining me. My name is Allani, and I'm the leader of this chapter of the White Tower. Perhaps you've heard about the goings-on within the forest of Fossmoor. Perhaps you haven't. Regardless, the issue is serious. And the truth is, our group is likely responsible for it. I want to resolve the issue, but I'll need a few experienced adventurers to assist me. You'll be compensated more than fairly, and if the safety of the city is of any interest to you, you can consider that a reward as well.\"",
  },
  {
    waypointIndex: 0,
    parentIndex: 8,
    nodeType: "story",
    dangerTable: null,
    trigger: "Ask about the ancient tome",
    summary: "A stolen occultist script from the restricted library.",
    readText:
      '"It was an occultist script taken without authorization from our restricted library. The acolyte may have had good intentions, but her recklessness and ignorance are hard to forgive. She could not fully understand its writings. In the end, the book would have been better off destroyed. Instead, it\'s possible that will be the fate of the great city of Merrick if something is not done."',
  },
  {
    waypointIndex: 0,
    parentIndex: 8,
    nodeType: "story",
    dangerTable: null,
    trigger: "Ask about Admjir",
    summary: "The first tree of Fossmoor — and a misread promise of immortality.",
    readText:
      '"Admjir is said to be the first tree of the forest of Fossmoor and the source of the forest\'s spirit. The tome stolen by the acolyte seemed to suggest that the branches of the first tree of the forest might be used to confer immortality to others. This... appears to have been misguided, or misinterpreted, or both."',
  },
  {
    waypointIndex: 0,
    parentIndex: 8,
    nodeType: "story",
    dangerTable: null,
    trigger: "Ask why no White Tower escort",
    summary: "Scholars, not warriors — the capable ones are far away.",
    readText:
      '"We are generally scholars, not warriors. Though some of us are quite skilled, the most capable among us are scattered across the continent, not sitting around Merrick with our noses in books and scrolls."',
  },
];

await initDb();

const rows = await getDb().execute(
  "SELECT id, user_id FROM dnd_campaigns WHERE status = 'ready' AND source_filename LIKE '%754298838%'",
);
if (rows.rows.length !== 1) {
  console.error(`expected exactly 1 campaign, found ${rows.rows.length}`);
  process.exit(1);
}
const campaignId = String(rows.rows[0]?.id);
const userId = String(rows.rows[0]?.user_id);
const campaign = (await listCampaignsForUser(userId)).find((c) => c.id === campaignId);
if (!campaign) throw new Error("campaign not readable back");

const fileId = await getCampaignFileId(campaignId, userId);
if (!fileId) throw new Error("no stored module PDF");
const base64 = await getFileBase64(fileId, userId);
if (!base64) throw new Error("stored PDF missing chunks");

console.log("re-extracting templates with the hierarchical pipeline…");
const extracted = await extractReadAloudNodes(
  `data:application/pdf;base64,${base64}`,
  campaign.sourceFilename,
  campaign.checkpoints,
);

// Drop extracted waypoint-0 blocks (the curated tree replaces them) and
// remap the survivors' parent indexes to their post-filter positions.
const keepPositions = new Map<number, number>();
const kept: ReadAloudBlock[] = [];
extracted.forEach((block, i) => {
  if (block.waypointIndex === 0) return;
  keepPositions.set(i, kept.length);
  kept.push({ ...block });
});
for (const block of kept) {
  block.parentIndex =
    block.parentIndex !== null ? (keepPositions.get(block.parentIndex) ?? null) : null;
}

// Compose: curated wp0 first, then the rest (parents offset by the prefix).
const offset = WAYPOINT_0.length;
const combined: ReadAloudBlock[] = [
  ...WAYPOINT_0,
  ...kept.map((b) => ({
    ...b,
    parentIndex: b.parentIndex !== null ? b.parentIndex + offset : null,
  })),
];

await replaceNodeTemplates(campaignId, userId, combined);
console.log(
  `templates written: ${combined.length} (${WAYPOINT_0.length} curated wp0 + ${kept.length} extracted)`,
);
for (const [i, b] of combined.entries()) {
  const parent = b.parentIndex !== null ? `← ${combined[b.parentIndex]?.trigger}` : "(root)";
  console.log(
    `  [wp ${b.waypointIndex}]${b.nodeType === "initiative" ? " ⚔" : ""} ${b.trigger} ${parent}${i === offset - 1 ? "\n  ---" : ""}`,
  );
}

const force = process.argv.includes("--force");
for (const party of await listPartiesForCampaign(campaignId, userId)) {
  const nodes = await listNodesForParty(party.id, userId);
  // Untouched = every node is a copy of some template (trigger+readText
  // match) — DM-grown nodes have novel content. Note the comparison is
  // against the NEW template set, so any re-extraction makes old seeds look
  // grown; pass --force after confirming the tree holds no real play state.
  const templateKeys = new Set(combined.map((b) => `${b.trigger}::${b.readText}`));
  const untouched = force || nodes.every((n) => templateKeys.has(`${n.trigger}::${n.readText}`));
  if (!untouched) {
    console.log(
      `party "${party.name}": tree has DM-grown nodes — left untouched (--force reseeds)`,
    );
    continue;
  }
  await getDb().execute({
    sql: "DELETE FROM dnd_nodes WHERE party_id = ? AND user_id = ?",
    args: [party.id, userId],
  });
  const seeded = await seedPartyFromTemplates(campaignId, party.id, userId);
  console.log(`party "${party.name}": re-seeded ${seeded} nodes (hierarchical)`);
}

console.log("curation complete");
