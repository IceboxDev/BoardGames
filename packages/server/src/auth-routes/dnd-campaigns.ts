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
  ActiveSessionResponseSchema,
  BeamerEventSchema,
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
  GenerateNodeRequestSchema,
  GenerateNodeResponseSchema,
  ListCampaignsResponseSchema,
  ListCharactersResponseSchema,
  ListFilesResponseSchema,
  ListNodesResponseSchema,
  ListNpcsResponseSchema,
  ListPartiesResponseSchema,
  RetriggerNpcsResponseSchema,
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
  insertCharacter,
  listCharactersForParty,
  setCharacterError,
  setCharacterFile,
  setCharacterReady,
} from "../lib/dnd-characters-db.ts";
import {
  DndConfigError,
  extractCampaign,
  extractCharacter,
  extractNpcs,
  extractReadAloudNodes,
  generateStoryNode,
} from "../lib/dnd-extract.ts";
import { getFileBase64, getFileMeta, insertFile, listFilesForUser } from "../lib/dnd-files-db.ts";
import { replaceNodeTemplates, seedPartyFromTemplates } from "../lib/dnd-node-templates-db.ts";
import { insertNode, listNodesForParty } from "../lib/dnd-nodes-db.ts";
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
  await setCharacterReady(id, c.req.valid("json").sheet);
  const character = await getCharacter(id, user.id);
  return c.json(UpdateCharacterResponseSchema.parse({ character }));
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
      return [s.name, "—", s.race, s.class, s.level !== null ? `level ${s.level}` : null]
        .filter(Boolean)
        .join(" ");
    })
    .filter((s) => s.length > 0);

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
