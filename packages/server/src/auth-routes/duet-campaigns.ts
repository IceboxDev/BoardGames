// Codenames: Duet campaigns — `/api/games/codenames-duet/campaigns/*`.
//
//   GET    /                       the member's campaigns (summaries)
//   POST   /                       start one {name, partner}
//   GET    /partners               members a campaign can be started with
//   GET    /:id                    one campaign with its games (members only)
//   PATCH  /:id                    rename / archive
//   POST   /:id/games              record a mission played at the table
//   DELETE /:id/games/:gameId      undo a table record (whoever recorded it)
//
// Online and solo missions are recorded by the game itself when it ends
// (`lib/duet-campaign/missions.ts`, via the Duet `afterGameOver`); a table
// game is the one result a member reports.

import { CITIES } from "@boardgames/core/games/codenames-duet/campaign/map";
import { canAttempt } from "@boardgames/core/games/codenames-duet/campaign/progress";
import {
  CampaignDetailResponseSchema,
  CampaignListResponseSchema,
  CampaignPartnerListResponseSchema,
  CreateCampaignBodySchema,
  RecordTableGameBodySchema,
  UpdateCampaignBodySchema,
} from "@boardgames/core/protocol";
import { authedApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { logActivity } from "../lib/activity-log.ts";
import {
  createCampaign,
  deleteTableGame,
  gameFacts,
  insertGame,
  listCampaigns,
  listPartnerCandidates,
  readCampaign,
  updateCampaign,
} from "../lib/duet-campaign/store.ts";
import { errorResponse, zJsonBody } from "../lib/error-response.ts";

export const duetCampaignRoutes = authedApp();

duetCampaignRoutes.get("/", async (c) => {
  const campaigns = await listCampaigns(getDb(), c.get("user").id);
  return c.json(CampaignListResponseSchema.parse({ campaigns }));
});

duetCampaignRoutes.get("/partners", async (c) => {
  const me = c.get("user").id;
  const members = (await listPartnerCandidates(getDb())).filter((m) => m.userId !== me);
  return c.json(CampaignPartnerListResponseSchema.parse({ members }));
});

duetCampaignRoutes.post("/", zJsonBody(CreateCampaignBodySchema), async (c) => {
  const user = c.get("user");
  const db = getDb();
  const body = c.req.valid("json");
  const created = await createCampaign(db, user.id, body);
  if (!created.ok) {
    return errorResponse(
      c,
      400,
      created.reason === "self-partner" ? "Pick someone else as your partner" : "Unknown member",
    );
  }
  logActivity(user.id, "duet-campaign-created", { name: body.name, partner: body.partner.kind });
  const campaign = await readCampaign(db, created.id, user.id);
  return c.json(CampaignDetailResponseSchema.parse({ campaign }), 201);
});

duetCampaignRoutes.get("/:id", async (c) => {
  const campaign = await readCampaign(getDb(), c.req.param("id"), c.get("user").id);
  if (!campaign) return errorResponse(c, 404, "Not found");
  return c.json(CampaignDetailResponseSchema.parse({ campaign }));
});

duetCampaignRoutes.patch("/:id", zJsonBody(UpdateCampaignBodySchema), async (c) => {
  const db = getDb();
  const userId = c.get("user").id;
  const id = c.req.param("id");
  if (!(await readCampaign(db, id, userId))) return errorResponse(c, 404, "Not found");
  await updateCampaign(db, id, c.req.valid("json"));
  const campaign = await readCampaign(db, id, userId);
  return c.json(CampaignDetailResponseSchema.parse({ campaign }));
});

duetCampaignRoutes.post("/:id/games", zJsonBody(RecordTableGameBodySchema), async (c) => {
  const db = getDb();
  const userId = c.get("user").id;
  const body = c.req.valid("json");
  const campaign = await readCampaign(db, c.req.param("id"), userId);
  if (!campaign) return errorResponse(c, 404, "Not found");
  if (campaign.archived) return errorResponse(c, 409, "That campaign is archived");
  const id = `table:${body.clientId}`;
  const already = campaign.games.some((g) => g.id === id);
  if (!already && !canAttempt(body.city, gameFacts(campaign))) {
    return errorResponse(c, 400, "That mission isn't open yet — clear a city next to it first");
  }
  const created = await insertGame(db, {
    id,
    campaignId: campaign.id,
    city: body.city,
    won: body.won,
    agentsFound: body.agentsFound ?? null,
    tokensLeft: body.tokensLeft ?? null,
    mode: "table",
    replayId: null,
    playedAt: body.playedAt ? new Date(body.playedAt) : new Date(),
    recordedBy: userId,
    note: body.note ? body.note : null,
  });
  if (created) {
    logActivity(userId, "duet-campaign-recorded", {
      campaign: campaign.name,
      city: CITIES[body.city].name,
      won: body.won,
    });
  }
  const updated = await readCampaign(db, campaign.id, userId);
  return c.json(CampaignDetailResponseSchema.parse({ campaign: updated }), created ? 201 : 200);
});

duetCampaignRoutes.delete("/:id/games/:gameId", async (c) => {
  const db = getDb();
  const userId = c.get("user").id;
  const campaign = await readCampaign(db, c.req.param("id"), userId);
  if (!campaign) return errorResponse(c, 404, "Not found");
  const deleted = await deleteTableGame(db, campaign.id, c.req.param("gameId"), userId);
  if (!deleted) return errorResponse(c, 404, "Only a table game you recorded can be removed");
  const updated = await readCampaign(db, campaign.id, userId);
  return c.json(CampaignDetailResponseSchema.parse({ campaign: updated }));
});
