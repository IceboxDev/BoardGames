// Skill-rating endpoints — leaderboards and per-player detail. Mounted at
// `/api/skills` behind requireAuth + requireOffline (same gate as profiles:
// every offline member sees every profile, and the hall of fame is
// group-public in the same sense).
//
// All numbers are pre-derived by the recompute service (`lib/skill-ratings`)
// from the stored fit; these handlers only slice the state and join display
// names. Clients must never re-derive ranks or percentiles.

import {
  PlayerSkillResponseSchema,
  SkillLeaderboardsResponseSchema,
} from "@boardgames/core/protocol";
import { authedApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { errorResponse } from "../lib/error-response.ts";
import { unratedPayload } from "../lib/skill-payload.ts";
import { ensureSkillState } from "../lib/skill-ratings.ts";
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

// The greeting queue moved to `/api/greetings` (auth-routes/greetings.ts) —
// the popup is app-wide now, not a profile-page feature.
