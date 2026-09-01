import {
  daysAtZeroCoverage,
  INACTIVE_AFTER_DAYS,
  isInactiveMember,
} from "@boardgames/core/availability/inactivity";
import {
  AgentInactivityResponseSchema,
  AgentWhoamiResponseSchema,
} from "@boardgames/core/protocol";
import { z } from "zod";
import { agentApp } from "../auth/agent-auth.ts";
import { getDb } from "../db.ts";
import {
  fetchAllAvailabilityDays,
  fetchAllRsvpNoByUser,
  fetchAllRsvpYesByUser,
} from "../lib/availability-merge.ts";
import { parseRows } from "../lib/db-rows.ts";

// Read-only, agent-authenticated endpoints (see auth/agent-auth.ts for the
// vestauth verification and the dark-by-default allowlist). Purpose: let a
// signed agent request verify what the auth-gated admin view would show in
// prod. GET-only, no emails, no writes — keep it that way (the signature
// binds only the request host, so this surface must never gain side effects).

export const agentRoutes = agentApp();

// Signature + allowlist smoke test: echoes the verified agent uid.
agentRoutes.get("/whoami", (c) => {
  return c.json(AgentWhoamiResponseSchema.parse({ uid: c.get("agentUid") }));
});

const MemberRowSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  role: z.string().nullable(),
  createdAt: z.string(),
});

const LastPlayedRowSchema = z.object({ user_id: z.string(), last_played: z.string() });

const dateKeyUtc = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The same snapshot the admin page computes client-side: per visible member,
 * their coverage of the editable window, the inactivity clock, and whether
 * they land in the "Inactive players" card — using the shared rules from
 * core/availability/inactivity. One deliberate difference: the window is
 * derived in UTC (the page uses the viewer's local timezone), so snapshots
 * taken near midnight can differ by a day.
 */
agentRoutes.get("/admin/inactivity", async (c) => {
  const db = getDb();
  const [availabilityByUser, rsvpYesByUser, rsvpNoByUser, usersRes, lastPlayedRes] =
    await Promise.all([
      fetchAllAvailabilityDays(db),
      fetchAllRsvpYesByUser(db),
      fetchAllRsvpNoByUser(db),
      db.execute(
        `SELECT id, name, role, createdAt FROM "user"
         WHERE (internal IS NULL OR internal = 0) AND (guest IS NULL OR guest = 0)`,
      ),
      db.execute(
        `SELECT mp.user_id AS user_id, substr(MAX(mr.played_at), 1, 10) AS last_played
         FROM match_participants mp
         JOIN match_results mr ON mr.id = mp.match_id
         GROUP BY mp.user_id`,
      ),
    ]);

  const lastPlayedByUser = new Map<string, string>();
  for (const r of parseRows(LastPlayedRowSchema, lastPlayedRes.rows, "agent.last-played")) {
    lastPlayedByUser.set(r.user_id, r.last_played);
  }

  // Editable window, UTC flavour of the admin page's: today → end of the
  // 42-day grid that starts on this week's Monday.
  const now = new Date();
  const todayKey = dateKeyUtc(now);
  const monday = new Date(now);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const windowEnd = new Date(monday);
  windowEnd.setUTCDate(windowEnd.getUTCDate() + 41);
  const windowEndKey = dateKeyUtc(windowEnd);
  const windowDays = Math.max(
    0,
    1 + Math.round((windowEnd.getTime() - new Date(`${todayKey}T00:00Z`).getTime()) / 86_400_000),
  );

  const members = parseRows(MemberRowSchema, usersRes.rows, "agent.members").map((u) => {
    // Merged marked days, matching the admin aggregate: stored can/maybe,
    // rsvp-yes promoted to can, rsvp-no deleting the date.
    const marked = new Set<string>(Object.keys(availabilityByUser.get(u.id) ?? {}));
    for (const date of rsvpYesByUser.get(u.id) ?? []) marked.add(date);
    for (const date of rsvpNoByUser.get(u.id) ?? []) marked.delete(date);

    let can = 0;
    let maybe = 0;
    let latestMarkedDay: string | null = null;
    const stored = availabilityByUser.get(u.id) ?? {};
    const rsvpYes = rsvpYesByUser.get(u.id);
    for (const date of marked) {
      if (latestMarkedDay === null || date > latestMarkedDay) latestMarkedDay = date;
      if (date < todayKey || date > windowEndKey) continue;
      // rsvp-yes counts as "can" even over a stored "maybe".
      if (rsvpYes?.has(date) || stored[date] === "can") can += 1;
      else maybe += 1;
    }

    const coverage = { can, maybe, total: windowDays };
    const lastPlayedDay = lastPlayedByUser.get(u.id) ?? null;
    const zeroDays = daysAtZeroCoverage({
      coverage,
      latestMarkedDay: latestMarkedDay ?? undefined,
      lastPlayedDay: lastPlayedDay ?? undefined,
      createdAt: u.createdAt,
      todayKey,
    });
    return {
      userId: u.id,
      name: (u.name ?? "").trim() || "—",
      role: u.role,
      coverage,
      latestMarkedDay,
      lastPlayedDay,
      zeroDays,
      inactive: isInactiveMember(u.role, coverage, zeroDays),
    };
  });
  members.sort((a, b) => b.zeroDays - a.zeroDays || a.name.localeCompare(b.name));

  return c.json(
    AgentInactivityResponseSchema.parse({
      generatedAt: now.toISOString(),
      todayKey,
      windowEndKey,
      inactiveAfterDays: INACTIVE_AFTER_DAYS,
      members,
    }),
  );
});
