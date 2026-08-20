// Skill-rating endpoints — leaderboards, per-player detail, and the greeting
// queue. Mounted at `/api/skills` behind requireAuth + requireOffline (same
// gate as profiles: every offline member sees every profile, and the hall of
// fame is group-public in the same sense).
//
// All numbers are pre-derived by the recompute service (`lib/skill-ratings`)
// from the stored fit; these handlers only slice the state and join display
// names. Clients must never re-derive ranks or percentiles.

import {
  GreetingAckBodySchema,
  GreetingAckResponseSchema,
  GreetingResponseSchema,
  PlayerSkillResponseSchema,
  SkillLeaderboardsResponseSchema,
} from "@boardgames/core/protocol";
import { authedApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { errorResponse, zJsonBody } from "../lib/error-response.ts";
import { nextGreetingFor } from "../lib/greetings.ts";
import { unratedPayload } from "../lib/skill-payload.ts";
import { ensureSkillState } from "../lib/skill-ratings.ts";
import { greetingUserIds } from "../lib/spotlight-payload.ts";
import { playerRefs } from "../lib/user-refs.ts";

export const skillsRoutes = authedApp();

// ── GET /api/skills/leaderboards ───────────────────────────────────────

skillsRoutes.get("/leaderboards", async (c) => {
  // One read for the numbers AND the timestamp. This used to call
  // `skillComputedAt()` as well, which re-read the same (large) row purely to
  // fetch `computed_at`.
  const snapshot = await ensureSkillState();
  if (!snapshot) return errorResponse(c, 500, "skill state unavailable", "INTERNAL");
  const { state, computedAt } = snapshot;

  const ids = new Set<string>();
  for (const board of state.leaderboards.traits) for (const e of board.entries) ids.add(e.userId);
  for (const board of state.leaderboards.games) for (const e of board.entries) ids.add(e.userId);

  return c.json(
    SkillLeaderboardsResponseSchema.parse({
      eligibleCount: state.eligibleCount,
      computedAt,
      traits: state.leaderboards.traits,
      games: state.leaderboards.games,
      players: await playerRefs(ids),
    }),
  );
});

// ── GET /api/skills/players/:userId ────────────────────────────────────

skillsRoutes.get("/players/:userId", async (c) => {
  const userId = c.req.param("userId");
  const [snapshot, userRes] = await Promise.all([
    ensureSkillState(),
    getDb().execute({ sql: `SELECT 1 FROM "user" WHERE id = ? LIMIT 1`, args: [userId] }),
  ]);
  if (userRes.rows.length === 0) return errorResponse(c, 404, "user not found", "NOT_FOUND");
  if (!snapshot) return errorResponse(c, 500, "skill state unavailable", "INTERNAL");

  return c.json(
    PlayerSkillResponseSchema.parse(snapshot.state.players[userId] ?? unratedPayload(userId)),
  );
});

// ── GET /api/skills/greeting ───────────────────────────────────────────

skillsRoutes.get("/greeting", async (c) => {
  const viewer = c.get("user");
  const greeting = await nextGreetingFor(viewer.id, (await ensureSkillState())?.state ?? null);
  return c.json(
    GreetingResponseSchema.parse({
      greeting,
      players: await playerRefs(greetingUserIds(greeting)),
    }),
  );
});

// ── POST /api/skills/greeting/ack ──────────────────────────────────────
//
// Acknowledging is idempotent and monotonic in both arms: the intro keeps its
// first timestamp, and the seen id only ever moves forward, so a stale tab
// acking an older spotlight can't re-open a newer one.

skillsRoutes.post("/greeting/ack", zJsonBody(GreetingAckBodySchema), async (c) => {
  const viewer = c.get("user");
  const body = c.req.valid("json");
  await getDb().execute(
    body.kind === "skill-intro"
      ? {
          sql: `INSERT INTO user_profiles (user_id, skill_intro_seen_at, updated_at)
                VALUES (?, datetime('now'), datetime('now'))
                ON CONFLICT(user_id) DO UPDATE SET
                  skill_intro_seen_at = COALESCE(user_profiles.skill_intro_seen_at, excluded.skill_intro_seen_at)`,
          args: [viewer.id],
        }
      : {
          sql: `INSERT INTO user_profiles (user_id, greeting_seen_id, updated_at)
                VALUES (?, ?, datetime('now'))
                ON CONFLICT(user_id) DO UPDATE SET
                  greeting_seen_id = MAX(COALESCE(user_profiles.greeting_seen_id, 0), excluded.greeting_seen_id)`,
          args: [viewer.id, body.id],
        },
  );
  return c.json(GreetingAckResponseSchema.parse({ ok: true }));
});
