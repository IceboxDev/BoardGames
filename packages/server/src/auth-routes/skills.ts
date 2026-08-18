// Skill-rating endpoints — leaderboards, per-player detail, and the one-time
// intro card. Mounted at `/api/skills` behind requireAuth + requireOffline
// (same gate as profiles: every offline member sees every profile, and the
// hall of fame is club-public in the same sense).
//
// All numbers are pre-derived by the recompute service (`lib/skill-ratings`)
// from the stored fit; these handlers only slice the state and join display
// names. Clients must never re-derive ranks or percentiles.

import {
  PlayerSkillResponseSchema,
  SkillIntroAckResponseSchema,
  SkillIntroResponseSchema,
  SkillLeaderboardsResponseSchema,
} from "@boardgames/core/protocol";
import { z } from "zod";
import { authedApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { parseRows } from "../lib/db-rows.ts";
import { errorResponse } from "../lib/error-response.ts";
import { unratedPayload } from "../lib/skill-payload.ts";
import { ensureSkillState, introHighlightFor } from "../lib/skill-ratings.ts";

export const skillsRoutes = authedApp();

const NameRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  image: z.string().nullable(),
});

const IntroRowSchema = z.object({ skill_intro_seen_at: z.string().nullable() });

async function playerRefs(
  ids: ReadonlySet<string>,
): Promise<Record<string, { name: string; image: string | null }>> {
  if (ids.size === 0) return {};
  const list = [...ids];
  const placeholders = list.map(() => "?").join(",");
  const { rows } = await getDb().execute({
    sql: `SELECT id, name, image FROM user WHERE id IN (${placeholders})`,
    args: list,
  });
  const out: Record<string, { name: string; image: string | null }> = {};
  for (const r of parseRows(NameRowSchema, rows, "user.skill-refs")) {
    out[r.id] = { name: r.name, image: r.image };
  }
  return out;
}

// ── GET /api/skills/leaderboards ───────────────────────────────────────

skillsRoutes.get("/leaderboards", async (c) => {
  const state = await ensureSkillState();
  if (!state) return errorResponse(c, 500, "skill state unavailable", "INTERNAL");

  const ids = new Set<string>();
  for (const board of state.leaderboards.traits) for (const e of board.entries) ids.add(e.userId);
  for (const board of state.leaderboards.games) for (const e of board.entries) ids.add(e.userId);

  return c.json(
    SkillLeaderboardsResponseSchema.parse({
      eligibleCount: state.eligibleCount,
      traits: state.leaderboards.traits,
      games: state.leaderboards.games,
      players: await playerRefs(ids),
    }),
  );
});

// ── GET /api/skills/players/:userId ────────────────────────────────────

skillsRoutes.get("/players/:userId", async (c) => {
  const userId = c.req.param("userId");
  const [state, userRes] = await Promise.all([
    ensureSkillState(),
    getDb().execute({ sql: `SELECT 1 FROM "user" WHERE id = ? LIMIT 1`, args: [userId] }),
  ]);
  if (userRes.rows.length === 0) return errorResponse(c, 404, "user not found", "NOT_FOUND");
  if (!state) return errorResponse(c, 500, "skill state unavailable", "INTERNAL");

  return c.json(PlayerSkillResponseSchema.parse(state.players[userId] ?? unratedPayload(userId)));
});

// ── GET /api/skills/intro ──────────────────────────────────────────────

skillsRoutes.get("/intro", async (c) => {
  const viewer = c.get("user");
  const state = await ensureSkillState();
  const player = state?.players[viewer.id];
  if (!state || !player?.eligibility.eligible) {
    return c.json(SkillIntroResponseSchema.parse({ show: false, highlight: null }));
  }
  const { rows } = await getDb().execute({
    sql: "SELECT skill_intro_seen_at FROM user_profiles WHERE user_id = ? LIMIT 1",
    args: [viewer.id],
  });
  const seen =
    rows.length > 0 &&
    parseRows(IntroRowSchema, rows, "user_profiles.skill-intro")[0].skill_intro_seen_at !== null;
  return c.json(
    SkillIntroResponseSchema.parse({
      show: !seen,
      highlight: seen ? null : introHighlightFor(state, viewer.id),
    }),
  );
});

// ── POST /api/skills/intro-ack ─────────────────────────────────────────

skillsRoutes.post("/intro-ack", async (c) => {
  const viewer = c.get("user");
  await getDb().execute({
    sql: `INSERT INTO user_profiles (user_id, skill_intro_seen_at, updated_at)
          VALUES (?, datetime('now'), datetime('now'))
          ON CONFLICT(user_id) DO UPDATE SET skill_intro_seen_at = COALESCE(user_profiles.skill_intro_seen_at, excluded.skill_intro_seen_at)`,
    args: [viewer.id],
  });
  return c.json(SkillIntroAckResponseSchema.parse({ ok: true }));
});
