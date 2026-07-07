// D&D DM-tool campaign routes. Mounted under `/api/dnd` (requireAuth +
// requireOnline — the tool lives in the play area).
//
// Extraction takes longer than the prod proxy (Vercel rewrite → Railway) holds
// a request open, so POST inserts the row with status 'processing', kicks off a
// background job, and returns immediately; the client polls the list. The DB
// row IS the job — no in-memory state, so polling survives restarts (a boot
// sweep flips orphaned 'processing' rows to 'error').

import { randomUUID } from "node:crypto";
import {
  ABILITY_KEYS,
  type ActionCard,
  ActiveCombatResponseSchema,
  ActiveSessionResponseSchema,
  AppendHistoryRequestSchema,
  BeamerEventSchema,
  CharacterActionsResponseSchema,
  type Combatant,
  CombatResponseSchema,
  CreateCampaignRequestSchema,
  CreateCampaignResponseSchema,
  CreateCharacterRequestSchema,
  CreateCharacterResponseSchema,
  CreatePartyRequestSchema,
  CreatePartyResponseSchema,
  CreateSessionRequestSchema,
  CreateSessionResponseSchema,
  DeleteCampaignResponseSchema,
  DeleteCharacterResponseSchema,
  DeletePartyResponseSchema,
  displayCharacterName,
  GenerateNodeRequestSchema,
  GenerateNodeResponseSchema,
  ListCampaignsResponseSchema,
  ListCharactersResponseSchema,
  ListFilesResponseSchema,
  ListHistoryResponseSchema,
  ListNodesResponseSchema,
  ListNpcsResponseSchema,
  ListPartiesResponseSchema,
  ResolveTurnRequestSchema,
  ResolveTurnResponseSchema,
  RetriggerNpcsResponseSchema,
  StartCombatRequestSchema,
  TriggerBeamerRequestSchema,
  TriggerBeamerResponseSchema,
  UpdateCharacterRequestSchema,
  UpdateCharacterResponseSchema,
} from "@boardgames/core/protocol";
import { streamSSE } from "hono/streaming";
import { authedApp } from "../auth/index.ts";
import {
  countCampaignsForUser,
  deleteCampaign,
  getCampaign,
  getCampaignFileId,
  insertCampaign,
  listCampaignsForUser,
  setCampaignError,
  setCampaignFile,
  setCampaignReady,
} from "../lib/dnd-campaigns-db.ts";
import {
  countCharactersForCampaign,
  deleteCharacter,
  deleteCharactersForCampaign,
  getCharacter,
  getCharacterActions,
  insertCharacter,
  listCharactersForParty,
  setCharacterActions,
  setCharacterError,
  setCharacterFile,
  setCharacterReady,
} from "../lib/dnd-characters-db.ts";
import { getActiveCombat, getCombat, insertCombat, updateCombat } from "../lib/dnd-combats-db.ts";
import {
  DndConfigError,
  extractCampaign,
  extractCharacter,
  extractNpcs,
  extractReadAloudNodes,
  generateActionCards,
  generateAftermath,
  generateStoryNode,
  resolveCombatTurn,
} from "../lib/dnd-extract.ts";
import { getFileBase64, getFileMeta, insertFile, listFilesForUser } from "../lib/dnd-files-db.ts";
import { appendHistory, listHistoryForParty } from "../lib/dnd-history-db.ts";
import { replaceNodeTemplates, seedPartyFromTemplates } from "../lib/dnd-node-templates-db.ts";
import { convertNodeToStory, insertNode, listNodesForParty } from "../lib/dnd-nodes-db.ts";
import { deleteNpcsForCampaign, insertNpcs, listNpcsForCampaign } from "../lib/dnd-npcs-db.ts";
import {
  deleteParty,
  getParty,
  insertParty,
  listPartiesForCampaign,
} from "../lib/dnd-parties-db.ts";
import {
  broadcastToSession,
  createOrReuseSession,
  getActiveSession,
  getSession,
  subscribeToSession,
} from "../lib/dnd-sessions.ts";
import { errorResponse, zJsonBody } from "../lib/error-response.ts";

/** Strip the `data:application/pdf;base64,` header for chunked storage. */
function dataUriBase64(pdfDataUri: string): string {
  return pdfDataUri.slice(pdfDataUri.indexOf(",") + 1);
}

const MAX_CAMPAIGNS_PER_USER = 20;
const MAX_CHARACTERS_PER_CAMPAIGN = 12;

function extractionErrorMessage(err: unknown): string {
  return err instanceof DndConfigError
    ? err.message
    : `Extraction failed: ${err instanceof Error ? err.message : "unknown error"}`;
}

export const dndCampaignRoutes = authedApp();

dndCampaignRoutes.get("/campaigns", async (c) => {
  const campaigns = await listCampaignsForUser(c.get("user").id);
  return c.json(ListCampaignsResponseSchema.parse({ campaigns }));
});

dndCampaignRoutes.post("/campaigns", zJsonBody(CreateCampaignRequestSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  if ((await countCampaignsForUser(user.id)) >= MAX_CAMPAIGNS_PER_USER) {
    return errorResponse(
      c,
      409,
      `campaign limit reached (${MAX_CAMPAIGNS_PER_USER}) — delete an old campaign first`,
      "TOO_MANY_CAMPAIGNS",
    );
  }

  // The data URI stays in memory for the job's lifetime only; the row stores
  // just the filename + decoded size for display.
  const sizeBytes = Math.floor(((body.pdf.length - body.pdf.indexOf(",") - 1) * 3) / 4);
  const campaign = await insertCampaign({
    id: randomUUID(),
    userId: user.id,
    sourceFilename: body.filename,
    sourceSizeBytes: sizeBytes,
  });

  // Run in the background — the request returns now; the work outlives it on
  // the persistent Node server. `void` + an internal try/catch keeps it from
  // ever becoming an unhandled rejection.
  void (async () => {
    // Persist the module PDF first (chunked) so NPC re-extraction and the
    // Sources screen work even if the extraction below fails.
    try {
      const fileId = await insertFile({
        userId: user.id,
        campaignId: campaign.id,
        kind: "module",
        filename: body.filename,
        base64: dataUriBase64(body.pdf),
        sizeBytes,
      });
      await setCampaignFile(campaign.id, fileId);
    } catch (err) {
      console.error("[dnd] failed to persist module PDF (campaign continues)", err);
    }
    try {
      // Checkpoints and NPC cards are two independent reads of the same PDF —
      // run them in parallel. A failed NPC pass degrades to "no NPCs" rather
      // than failing the campaign. The read-aloud pass needs the checkpoints,
      // so it runs after.
      const [extracted, npcs] = await Promise.all([
        extractCampaign(body.pdf, body.filename),
        extractNpcs(body.pdf, body.filename).catch((err) => {
          console.error("[dnd] npc extraction failed (campaign continues)", err);
          return [];
        }),
      ]);
      await setCampaignReady(campaign.id, extracted);
      await insertNpcs(campaign.id, user.id, npcs);
      try {
        const blocks = await extractReadAloudNodes(body.pdf, body.filename, extracted.checkpoints);
        await replaceNodeTemplates(campaign.id, user.id, blocks);
      } catch (err) {
        console.error("[dnd] read-aloud extraction failed (campaign continues)", err);
      }
    } catch (err) {
      try {
        await setCampaignError(campaign.id, extractionErrorMessage(err));
      } catch (dbErr) {
        console.error("[dnd] failed to record campaign error", dbErr);
      }
    }
  })();

  return c.json(CreateCampaignResponseSchema.parse({ campaign }), 201);
});

dndCampaignRoutes.delete("/campaigns/:id", async (c) => {
  const user = c.get("user");
  const campaignId = c.req.param("id");
  // Scoped delete — a foreign or unknown id both 404 (no existence leak).
  const deleted = await deleteCampaign(campaignId, user.id);
  if (!deleted) return errorResponse(c, 404, "campaign not found", "NOT_FOUND");
  await deleteCharactersForCampaign(campaignId, user.id);
  await deleteNpcsForCampaign(campaignId, user.id);
  return c.json(DeleteCampaignResponseSchema.parse({ ok: true }));
});

dndCampaignRoutes.get("/campaigns/:id/npcs", async (c) => {
  const user = c.get("user");
  const campaignId = c.req.param("id");
  if (!(await getCampaign(campaignId, user.id))) {
    return errorResponse(c, 404, "campaign not found", "NOT_FOUND");
  }
  const npcs = await listNpcsForCampaign(campaignId, user.id);
  return c.json(ListNpcsResponseSchema.parse({ npcs }));
});

// Re-run NPC extraction from the stored module PDF (fire-and-forget; the
// client re-polls the NPC list). 409 when the PDF predates file storage.
dndCampaignRoutes.post("/campaigns/:id/npcs/retrigger", async (c) => {
  const user = c.get("user");
  const campaignId = c.req.param("id");
  const campaign = await getCampaign(campaignId, user.id);
  if (!campaign || campaign.status !== "ready") {
    return errorResponse(c, 404, "campaign not found", "NOT_FOUND");
  }
  const fileId = await getCampaignFileId(campaignId, user.id);
  if (!fileId) {
    return errorResponse(
      c,
      409,
      "the module PDF was uploaded before source storage existed — upload the campaign again to recharter NPCs",
      "NO_SOURCE_PDF",
    );
  }

  const npcCount = (await listNpcsForCampaign(campaignId, user.id)).length;
  void (async () => {
    try {
      const base64 = await getFileBase64(fileId, user.id);
      if (!base64) throw new Error("stored PDF is missing its chunks");
      const npcs = await extractNpcs(
        `data:application/pdf;base64,${base64}`,
        campaign.sourceFilename,
      );
      await deleteNpcsForCampaign(campaignId, user.id);
      await insertNpcs(campaignId, user.id, npcs);
    } catch (err) {
      console.error("[dnd] npc retrigger failed", err);
    }
  })();

  return c.json(RetriggerNpcsResponseSchema.parse({ ok: true, npcCount }), 202);
});

// ── Parties ────────────────────────────────────────────────────────────

dndCampaignRoutes.get("/campaigns/:id/parties", async (c) => {
  const user = c.get("user");
  const campaignId = c.req.param("id");
  if (!(await getCampaign(campaignId, user.id))) {
    return errorResponse(c, 404, "campaign not found", "NOT_FOUND");
  }
  const parties = await listPartiesForCampaign(campaignId, user.id);
  return c.json(ListPartiesResponseSchema.parse({ parties }));
});

dndCampaignRoutes.post("/campaigns/:id/parties", zJsonBody(CreatePartyRequestSchema), async (c) => {
  const user = c.get("user");
  const campaignId = c.req.param("id");
  const campaign = await getCampaign(campaignId, user.id);
  if (!campaign || campaign.status !== "ready") {
    return errorResponse(c, 404, "campaign not found", "NOT_FOUND");
  }
  const party = await insertParty({ campaignId, userId: user.id, name: c.req.valid("json").name });
  // Seed the new party's story tree from the module's read-aloud script.
  await seedPartyFromTemplates(campaignId, party.id, user.id);
  return c.json(CreatePartyResponseSchema.parse({ party }), 201);
});

dndCampaignRoutes.delete("/parties/:id", async (c) => {
  // FK cascades take the party's characters and story nodes with it.
  const deleted = await deleteParty(c.req.param("id"), c.get("user").id);
  if (!deleted) return errorResponse(c, 404, "party not found", "NOT_FOUND");
  return c.json(DeletePartyResponseSchema.parse({ ok: true }));
});

// ── Characters ─────────────────────────────────────────────────────────

dndCampaignRoutes.get("/parties/:id/characters", async (c) => {
  const user = c.get("user");
  const partyId = c.req.param("id");
  if (!(await getParty(partyId, user.id))) {
    return errorResponse(c, 404, "party not found", "NOT_FOUND");
  }
  const characters = await listCharactersForParty(partyId, user.id);
  return c.json(ListCharactersResponseSchema.parse({ characters }));
});

dndCampaignRoutes.post(
  "/campaigns/:id/characters",
  zJsonBody(CreateCharacterRequestSchema),
  async (c) => {
    const user = c.get("user");
    const campaignId = c.req.param("id");
    const body = c.req.valid("json");

    if (!(await getCampaign(campaignId, user.id))) {
      return errorResponse(c, 404, "campaign not found", "NOT_FOUND");
    }
    const party = await getParty(body.partyId, user.id);
    if (!party || party.campaignId !== campaignId) {
      return errorResponse(c, 404, "party not found", "NOT_FOUND");
    }
    if ((await countCharactersForCampaign(campaignId, user.id)) >= MAX_CHARACTERS_PER_CAMPAIGN) {
      return errorResponse(
        c,
        409,
        `character limit reached (${MAX_CHARACTERS_PER_CAMPAIGN}) — remove a character first`,
        "TOO_MANY_CHARACTERS",
      );
    }

    const sizeBytes = Math.floor(((body.pdf.length - body.pdf.indexOf(",") - 1) * 3) / 4);
    const character = await insertCharacter({
      id: randomUUID(),
      campaignId,
      partyId: body.partyId,
      userId: user.id,
      sourceFilename: body.filename,
      sourceSizeBytes: sizeBytes,
    });

    // Same fire-and-forget contract as campaign creation above.
    void (async () => {
      try {
        const fileId = await insertFile({
          userId: user.id,
          campaignId,
          kind: "character-sheet",
          filename: body.filename,
          base64: dataUriBase64(body.pdf),
          sizeBytes,
        });
        await setCharacterFile(character.id, fileId);
      } catch (err) {
        console.error("[dnd] failed to persist character PDF (extraction continues)", err);
      }
      try {
        const sheet = await extractCharacter(body.pdf, body.filename);
        await setCharacterReady(character.id, sheet);
        // Precompute the combat action dashboard now, while nobody is
        // waiting — a fight is the worst moment for a cold LLM call.
        await cacheActionCards(character.id, sheet);
      } catch (err) {
        try {
          await setCharacterError(character.id, extractionErrorMessage(err));
        } catch (dbErr) {
          console.error("[dnd] failed to record character error", dbErr);
        }
      }
    })();

    return c.json(CreateCharacterResponseSchema.parse({ character }), 201);
  },
);

/** "Defeat the dead vines" — derived from the combat's enemy groups. */
function defeatTrigger(combatants: Combatant[]): string {
  const names = [
    ...new Set(
      combatants
        .filter((combatant) => combatant.kind === "enemy")
        .map((combatant) =>
          combatant.count > 1 && !combatant.name.toLowerCase().endsWith("s")
            ? `${combatant.name.toLowerCase()}s`
            : combatant.name.toLowerCase(),
        ),
    ),
  ];
  return names.length > 0 ? `Defeat the ${names.join(" and ")}` : "Survive the encounter";
}

/** Generate and cache a character's action dashboard; failure is non-fatal
 * (the combat-time endpoint regenerates on cache miss). */
async function cacheActionCards(characterId: string, sheet: unknown): Promise<void> {
  try {
    const cards = await generateActionCards(JSON.stringify(sheet));
    await setCharacterActions(characterId, JSON.stringify(cards));
  } catch (err) {
    console.error("[dnd] action card precompute failed (will retry on demand)", err);
  }
}

dndCampaignRoutes.delete("/characters/:id", async (c) => {
  const deleted = await deleteCharacter(c.req.param("id"), c.get("user").id);
  if (!deleted) return errorResponse(c, 404, "character not found", "NOT_FOUND");
  return c.json(DeleteCharacterResponseSchema.parse({ ok: true }));
});

dndCampaignRoutes.put("/characters/:id", zJsonBody(UpdateCharacterRequestSchema), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await getCharacter(id, user.id);
  if (!existing || existing.status !== "ready") {
    return errorResponse(c, 404, "character not found", "NOT_FOUND");
  }
  const sheet = c.req.valid("json").sheet;
  await setCharacterReady(id, sheet);
  // The dashboard math is derived from the sheet — stale cards are worse
  // than none. Drop the cache and rebuild it in the background.
  await setCharacterActions(id, null);
  void cacheActionCards(id, sheet);
  const character = await getCharacter(id, user.id);
  return c.json(UpdateCharacterResponseSchema.parse({ character }));
});

// ── Table history ──────────────────────────────────────────────────────
// Append-only session log. The DM's Log buttons post here; the History page
// and the generation context read from it.

dndCampaignRoutes.get("/parties/:id/history", async (c) => {
  const user = c.get("user");
  const partyId = c.req.param("id");
  if (!(await getParty(partyId, user.id))) {
    return errorResponse(c, 404, "party not found", "NOT_FOUND");
  }
  const entries = await listHistoryForParty(partyId, user.id);
  return c.json(ListHistoryResponseSchema.parse({ entries }));
});

dndCampaignRoutes.post("/parties/:id/history", zJsonBody(AppendHistoryRequestSchema), async (c) => {
  const user = c.get("user");
  const partyId = c.req.param("id");
  const party = await getParty(partyId, user.id);
  if (!party) return errorResponse(c, 404, "party not found", "NOT_FOUND");
  await appendHistory(party.campaignId, partyId, user.id, c.req.valid("json").entries);
  const entries = await listHistoryForParty(partyId, user.id);
  return c.json(ListHistoryResponseSchema.parse({ entries }), 201);
});

// ── Story nodes ────────────────────────────────────────────────────────
// The main game screen's tree. Generation is synchronous (text-only OpenAI
// call, seconds not minutes); the node is persisted before the response, so
// even a proxy timeout leaves the tree consistent — the client re-fetches.

dndCampaignRoutes.get("/parties/:id/nodes", async (c) => {
  const user = c.get("user");
  const partyId = c.req.param("id");
  if (!(await getParty(partyId, user.id))) {
    return errorResponse(c, 404, "party not found", "NOT_FOUND");
  }
  const nodes = await listNodesForParty(partyId, user.id);
  return c.json(ListNodesResponseSchema.parse({ nodes }));
});

dndCampaignRoutes.post("/parties/:id/nodes", zJsonBody(GenerateNodeRequestSchema), async (c) => {
  const user = c.get("user");
  const partyId = c.req.param("id");
  const body = c.req.valid("json");

  const party = await getParty(partyId, user.id);
  if (!party) return errorResponse(c, 404, "party not found", "NOT_FOUND");
  const campaign = await getCampaign(party.campaignId, user.id);
  if (!campaign || campaign.status !== "ready") {
    return errorResponse(c, 404, "campaign not found", "NOT_FOUND");
  }
  const waypoint = campaign.checkpoints[body.waypointIndex];
  if (!waypoint) return errorResponse(c, 400, "unknown waypoint", "BAD_WAYPOINT");

  const nodes = await listNodesForParty(partyId, user.id);
  const byId = new Map(nodes.map((n) => [n.id, n]));

  let parent = null;
  if (body.parentId !== null) {
    parent = byId.get(body.parentId) ?? null;
    if (!parent) return errorResponse(c, 404, "parent node not found", "NOT_FOUND");
    if (parent.waypointIndex !== body.waypointIndex) {
      return errorResponse(c, 400, "parent belongs to another waypoint", "BAD_WAYPOINT");
    }
  }

  // Root → parent chain of the branch being extended.
  const ancestors: { trigger: string; readText: string }[] = [];
  for (let cur = parent; cur; cur = cur.parentId ? (byId.get(cur.parentId) ?? null) : null) {
    ancestors.unshift({ trigger: cur.trigger, readText: cur.readText });
  }
  const siblings = nodes
    .filter((n) => n.waypointIndex === body.waypointIndex && n.parentId === body.parentId)
    .map((n) => ({ trigger: n.trigger, summary: n.summary }));

  const partyMembers = (await listCharactersForParty(partyId, user.id))
    .filter((ch) => ch.status === "ready" && ch.sheet)
    .map((ch) => {
      const s = ch.sheet;
      if (!s) return "";
      return [
        displayCharacterName(s, ch.sourceFilename),
        "—",
        s.race,
        s.class,
        s.level !== null ? `level ${s.level}` : null,
      ]
        .filter(Boolean)
        .join(" ");
    })
    .filter((s) => s.length > 0);

  // The table history is the ground truth of what the party knows — the
  // generator must not contradict it or assume unspoken knowledge.
  const historyLines = (await listHistoryForParty(partyId, user.id))
    .slice(-40)
    .map((h) => `[${h.kind === "player-action" ? "party" : "dm"}] ${h.text.slice(0, 300)}`);

  try {
    const generated = await generateStoryNode({
      campaign: {
        title: campaign.title ?? campaign.sourceFilename,
        tagline: campaign.tagline,
        setting: campaign.setting,
      },
      waypoint: {
        title: waypoint.title,
        description: waypoint.description,
        index: body.waypointIndex,
        total: campaign.checkpoints.length,
      },
      ancestors,
      siblings,
      party: partyMembers,
      history: historyLines,
      message: body.message,
    });
    const node = await insertNode({
      campaignId: campaign.id,
      partyId,
      userId: user.id,
      waypointIndex: body.waypointIndex,
      parentId: body.parentId,
      ...generated,
    });
    return c.json(GenerateNodeResponseSchema.parse({ node }), 201);
  } catch (err) {
    if (err instanceof DndConfigError) return errorResponse(c, 503, err.message, "NOT_CONFIGURED");
    return errorResponse(
      c,
      502,
      `node generation failed: ${err instanceof Error ? err.message : "unknown error"}`,
      "GENERATION_FAILED",
    );
  }
});

// ── Files (Sources) ────────────────────────────────────────────────────

dndCampaignRoutes.get("/files", async (c) => {
  const files = await listFilesForUser(c.get("user").id);
  return c.json(ListFilesResponseSchema.parse({ files }));
});

dndCampaignRoutes.get("/files/:id/content", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const meta = await getFileMeta(id, user.id);
  if (!meta) return errorResponse(c, 404, "file not found", "NOT_FOUND");
  const base64 = await getFileBase64(id, user.id);
  if (!base64) return errorResponse(c, 404, "file content missing", "NOT_FOUND");
  c.header("Content-Type", "application/pdf");
  c.header("Content-Disposition", `inline; filename="${meta.filename.replace(/"/g, "")}"`);
  c.header("Cache-Control", "private, max-age=3600");
  return c.body(Buffer.from(base64, "base64"));
});

// ── Combat ─────────────────────────────────────────────────────────────
// One active combat per party. The referee call is synchronous (seconds);
// updates apply only when no rule alerts are raised.

dndCampaignRoutes.get("/parties/:id/combat", async (c) => {
  const user = c.get("user");
  const partyId = c.req.param("id");
  if (!(await getParty(partyId, user.id))) {
    return errorResponse(c, 404, "party not found", "NOT_FOUND");
  }
  const combat = await getActiveCombat(partyId, user.id);
  return c.json(ActiveCombatResponseSchema.parse({ combat }));
});

dndCampaignRoutes.post("/parties/:id/combat", zJsonBody(StartCombatRequestSchema), async (c) => {
  const user = c.get("user");
  const partyId = c.req.param("id");
  const party = await getParty(partyId, user.id);
  if (!party) return errorResponse(c, 404, "party not found", "NOT_FOUND");
  const existing = await getActiveCombat(partyId, user.id);
  if (existing) return errorResponse(c, 409, "a combat is already active", "COMBAT_ACTIVE");
  const body = c.req.valid("json");
  const sorted = [...body.combatants].sort((a, b) => b.initiative - a.initiative);
  const combatants: Combatant[] = sorted.map((entry, i) => ({
    key: `c${i}`,
    name: entry.name,
    kind: entry.kind,
    characterId: entry.characterId,
    count: entry.count,
    initiative: entry.initiative,
    maxHp: entry.maxHp,
    hp: entry.maxHp,
    conditions: [],
    position: "",
    notes: "",
    grantedActions: [],
    removedActions: [],
  }));
  const combat = await insertCombat({
    campaignId: party.campaignId,
    partyId,
    userId: user.id,
    nodeId: body.nodeId,
    combatants,
  });
  return c.json(CombatResponseSchema.parse({ combat }), 201);
});

dndCampaignRoutes.post("/combats/:id/turn", zJsonBody(ResolveTurnRequestSchema), async (c) => {
  const user = c.get("user");
  const combat = await getCombat(c.req.param("id"), user.id);
  if (!combat || combat.status !== "active") {
    return errorResponse(c, 404, "combat not found", "NOT_FOUND");
  }
  const current = combat.combatants[combat.turnIndex % combat.combatants.length];
  if (!current) return errorResponse(c, 500, "combat has no combatants", "BAD_STATE");

  const characters = await listCharactersForParty(combat.partyId, user.id);
  // The brief must carry everything the DM's dashboard shows — race and the
  // cached action cards included — or the referee "corrects" features the
  // character verifiably has (it once rejected a Tabaxi's Feline Agility).
  const partyBriefs = (
    await Promise.all(
      characters
        .filter((ch) => ch.status === "ready" && ch.sheet)
        .map(async (ch) => {
          const sheet = ch.sheet;
          if (!sheet) return "";
          const cardsJson = await getCharacterActions(ch.id);
          const cards = cardsJson ? (JSON.parse(cardsJson) as ActionCard[]) : [];
          const options = cards
            .map((card) => `${card.name}${card.note ? ` — ${card.note.slice(0, 120)}` : ""}`)
            .join("; ");
          const identity = [
            sheet.race,
            sheet.class,
            sheet.level !== null ? `level ${sheet.level}` : null,
          ]
            .filter(Boolean)
            .join(" ");
          const abilities = sheet.abilities
            ? `, abilities ${ABILITY_KEYS.map((k) => `${k.toUpperCase()} ${sheet.abilities?.[k]}`).join(" ")}`
            : "";
          return `${displayCharacterName(sheet, ch.sourceFilename)}: ${identity}, AC ${sheet.armorClass ?? "?"}, HP ${sheet.maxHp ?? "?"}, speed ${sheet.speed ?? "?"}${abilities}${sheet.attacks.length > 0 ? `; attacks (verbatim from sheet): ${sheet.attacks.join(" | ")}` : ""}; weapons/gear: ${sheet.equipment.join(", ") || "-"}; spells: ${sheet.spells.join(", ") || "-"}${options ? `; combat options (authoritative — the character HAS all of these): ${options}` : ""}`;
        }),
    )
  ).filter((brief) => brief.length > 0);
  const party = await getParty(combat.partyId, user.id);
  const npcBriefs = party
    ? (await listNpcsForCampaign(party.campaignId, user.id)).map(
        (npc) =>
          `${npc.name} (${npc.kind ?? "?"}): AC ${npc.armorClass ?? "?"}, HP ${npc.maxHp ?? "?"} — ${npc.description.slice(0, 160)}${npc.secrets ? ` [DM-only, reveal only if a check earns it: ${npc.secrets.slice(0, 200)}]` : ""}`,
      )
    : [];
  // The encounter's scene text grounds knowledge checks ("what twisted this
  // place?") — without it the referee can only narrate the attempt.
  const combatNode = (await listNodesForParty(combat.partyId, user.id)).find(
    (node) => node.id === combat.nodeId,
  );
  const scene = combatNode ? `${combatNode.summary} ${combatNode.readText}`.slice(0, 700) : null;
  const history = (await listHistoryForParty(combat.partyId, user.id))
    .slice(-25)
    .map((h) => `[${h.kind === "player-action" ? "party" : "dm"}] ${h.text.slice(0, 240)}`);

  try {
    const result = await resolveCombatTurn({
      round: combat.round,
      currentName: current.name,
      currentCount: current.count,
      scene,
      combatants: combat.combatants,
      partyBriefs,
      npcBriefs,
      history,
      message: c.req.valid("json").message,
    });
    let updated = combat;
    const applied = result.alerts.length === 0;
    if (applied && result.updates.length > 0) {
      const byKey = new Map(result.updates.map((u) => [u.key, u]));
      const combatants = combat.combatants.map((combatant) => {
        const patch = byKey.get(combatant.key);
        return patch
          ? {
              ...combatant,
              hp: patch.hp,
              conditions: patch.conditions,
              position: patch.position,
              notes: patch.notes,
              grantedActions: patch.grantedActions,
              removedActions: patch.removedActions,
            }
          : combatant;
      });
      updated = (await updateCombat(combat.id, user.id, { combatants })) ?? combat;
    }
    return c.json(
      ResolveTurnResponseSchema.parse({
        narration: result.narration,
        alerts: result.alerts,
        applied,
        combat: updated,
      }),
    );
  } catch (err) {
    if (err instanceof DndConfigError) return errorResponse(c, 503, err.message, "NOT_CONFIGURED");
    return errorResponse(
      c,
      502,
      `turn resolution failed: ${err instanceof Error ? err.message : "unknown error"}`,
      "GENERATION_FAILED",
    );
  }
});

dndCampaignRoutes.post("/combats/:id/advance", async (c) => {
  const user = c.get("user");
  const combat = await getCombat(c.req.param("id"), user.id);
  if (!combat || combat.status !== "active") {
    return errorResponse(c, 404, "combat not found", "NOT_FOUND");
  }
  const nextIndex = (combat.turnIndex + 1) % combat.combatants.length;
  const updated = await updateCombat(combat.id, user.id, {
    turnIndex: nextIndex,
    round: nextIndex === 0 ? combat.round + 1 : combat.round,
  });
  return c.json(CombatResponseSchema.parse({ combat: updated }));
});

dndCampaignRoutes.post("/combats/:id/end", async (c) => {
  const user = c.get("user");
  const combat = await getCombat(c.req.param("id"), user.id);
  if (!combat) return errorResponse(c, 404, "combat not found", "NOT_FOUND");
  const updated = await updateCombat(combat.id, user.id, { status: "ended" });
  // The fight is over — the initiative node becomes a normal story node
  // ("Defeat the dead vines") whose read-aloud is rewritten as the battle's
  // AFTERMATH, generated from the logged history. Generation failure is
  // non-fatal: the node still converts, keeping its original text.
  let aftermath: { readText: string; summary: string } | undefined;
  try {
    const node = (await listNodesForParty(combat.partyId, user.id)).find(
      (n) => n.id === combat.nodeId,
    );
    const history = (await listHistoryForParty(combat.partyId, user.id))
      .slice(-25)
      .map((h) => `[${h.kind === "player-action" ? "party" : "dm"}] ${h.text.slice(0, 240)}`);
    aftermath = await generateAftermath({
      scene: node ? `${node.summary} ${node.readText}`.slice(0, 700) : null,
      combatants: combat.combatants,
      history,
    });
  } catch (err) {
    console.error("[dnd] aftermath generation failed (node still converts)", err);
  }
  await convertNodeToStory(combat.nodeId, user.id, defeatTrigger(combat.combatants), aftermath);
  return c.json(CombatResponseSchema.parse({ combat: updated }));
});

// Character combat dashboard: generated once from the sheet, cached.
dndCampaignRoutes.post("/characters/:id/actions", async (c) => {
  const user = c.get("user");
  const character = await getCharacter(c.req.param("id"), user.id);
  if (!character || character.status !== "ready" || !character.sheet) {
    return errorResponse(c, 404, "character not found", "NOT_FOUND");
  }
  const cached = await getCharacterActions(character.id);
  if (cached !== null) {
    return c.json(CharacterActionsResponseSchema.parse({ cards: JSON.parse(cached) }));
  }
  try {
    const cards = await generateActionCards(JSON.stringify(character.sheet));
    await setCharacterActions(character.id, JSON.stringify(cards));
    return c.json(CharacterActionsResponseSchema.parse({ cards }));
  } catch (err) {
    if (err instanceof DndConfigError) return errorResponse(c, 503, err.message, "NOT_CONFIGURED");
    return errorResponse(
      c,
      502,
      `action generation failed: ${err instanceof Error ? err.message : "unknown error"}`,
      "GENERATION_FAILED",
    );
  }
});

// ── Sessions (beamer / TTS companion) ──────────────────────────────────
// In-memory live-table registry — see lib/dnd-sessions.ts. The DM's screen
// creates a session when a campaign is opened; a companion device (same
// account) finds it via `active`, subscribes to `stream`, and renders
// whatever the DM triggers.

dndCampaignRoutes.post("/sessions", zJsonBody(CreateSessionRequestSchema), async (c) => {
  const user = c.get("user");
  const { campaignId } = c.req.valid("json");
  const campaign = await getCampaign(campaignId, user.id);
  if (!campaign || campaign.status !== "ready") {
    return errorResponse(c, 404, "campaign not found", "NOT_FOUND");
  }
  const session = createOrReuseSession(user.id, campaignId, campaign.title);
  return c.json(CreateSessionResponseSchema.parse({ session }));
});

dndCampaignRoutes.get("/sessions/active", (c) => {
  const session = getActiveSession(c.get("user").id);
  return c.json(ActiveSessionResponseSchema.parse({ session }));
});

dndCampaignRoutes.get("/sessions/:id/stream", (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const session = getSession(id, user.id);
  if (!session) return errorResponse(c, 404, "session not found", "NOT_FOUND");
  return streamSSE(c, async (stream) => {
    const unsubscribe = subscribeToSession(id, user.id, (data) => {
      void stream.writeSSE({ data });
    });
    stream.onAbort(() => unsubscribe?.());
    await stream.writeSSE({
      data: JSON.stringify(
        BeamerEventSchema.parse({
          type: "connected",
          campaignId: session.campaignId,
          campaignTitle: session.campaignTitle,
        }),
      ),
    });
    // Hold the stream open until the client disconnects (onAbort cleans up).
    await new Promise(() => {});
  });
});

dndCampaignRoutes.post("/sessions/:id/trigger", zJsonBody(TriggerBeamerRequestSchema), (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!getSession(id, user.id)) return errorResponse(c, 404, "session not found", "NOT_FOUND");
  const delivered = broadcastToSession(id, user.id, c.req.valid("json").event);
  return c.json(TriggerBeamerResponseSchema.parse({ ok: true, delivered }));
});
