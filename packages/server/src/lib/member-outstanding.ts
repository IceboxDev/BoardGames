// Everything each member still owes the group, in one pass: the admin's
// availability drawer lists it and the users table counts it. Per-night
// rules are core's `nightOutstanding`; this file only gathers each upcoming
// night's derived state (participants, still voting, EXIT winner) the same
// way `/locks` does — no per-night games payload — plus the purchase poll,
// the collection and the admins' open notes.

import { nightOutstanding, sortOutstanding } from "@boardgames/core/availability/outstanding";
import { EXIT_CATALOG_SLUG } from "@boardgames/core/games/exit-games";
import {
  type MemberOutstanding,
  nightDate,
  type OutstandingItem,
  VOTES_PER_PLAYER,
} from "@boardgames/core/protocol";
import type { Client } from "@libsql/client";
import { z } from "zod";
import { parseRows } from "./db-rows.ts";
import {
  deriveNightParticipants,
  loadActiveNightLocks,
  type NightLock,
  type NightParticipants,
  sealedAt,
} from "./night-participants.ts";
import { loadPickerFilterInputs } from "./night-picker-filters.ts";
import { loadNightGameInventories, nightLineupLeader } from "./night-winner.ts";
import { latestPoll, pollVotes } from "./purchase-vote.ts";

const MemberRowSchema = z.object({
  id: z.string(),
  role: z.string().nullable(),
  onlineMode: z.string().nullable(),
});
const RsvpRowSchema = z.object({
  date_key: z.string(),
  user_id: z.string(),
  status: z.enum(["yes", "no"]),
  rsvped_at: z.string(),
  auto: z.number().nullable(),
});
const AvailabilityRowSchema = z.object({
  date_key: z.string(),
  user_id: z.string(),
  status: z.enum(["can", "maybe"]),
});
const ReactionRowSchema = z.object({
  date_key: z.string(),
  user_id: z.string(),
  game_slug: z.string(),
  reaction: z.enum(["hype", "teach", "learn"]),
  created_at: z.string(),
  headcount: z.number().nullable(),
});
const ExitVoteRowSchema = z.object({ date_key: z.string(), user_id: z.string() });
const UserIdRowSchema = z.object({ user_id: z.string() });
const NoteCountRowSchema = z.object({ user_id: z.string(), open: z.number() });

function groupBy<T>(rows: readonly T[], key: (r: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = out.get(k);
    if (list) list.push(r);
    else out.set(k, [r]);
  }
  return out;
}

/**
 * Who has to pick an EXIT box: the attendees `/api/calendar/exit` counts
 * (open: expected ∪ yes ∪ can, minus no; private: the seated players whose
 * say counts).
 */
function exitAttendees(
  lock: NightLock,
  participants: NightParticipants,
  rsvps: readonly z.infer<typeof RsvpRowSchema>[],
  availability: readonly z.infer<typeof AvailabilityRowSchema>[],
): string[] {
  if (lock.isPrivate) return participants.seated.filter((id) => participants.voters.has(id));
  const ids = new Set(lock.expectedUserIds);
  for (const r of rsvps) if (r.status === "yes") ids.add(r.user_id);
  for (const a of availability) if (a.status === "can") ids.add(a.user_id);
  for (const r of rsvps) if (r.status === "no") ids.delete(r.user_id);
  return [...ids];
}

export async function computeOutstanding(
  db: Client,
  todayKey: string,
): Promise<Record<string, MemberOutstanding>> {
  const [
    membersRes,
    allLocks,
    rsvpRes,
    availabilityRes,
    reactionRes,
    exitRes,
    inventoryByUser,
    pickerFilters,
    poll,
    notesRes,
    declaredRes,
  ] = await Promise.all([
    db.execute(
      `SELECT id, role, "onlineMode" AS onlineMode FROM "user"
        WHERE (internal IS NULL OR internal = 0) AND (guest IS NULL OR guest = 0)
          AND (banned IS NULL OR banned = 0)`,
    ),
    loadActiveNightLocks(db),
    db.execute({
      sql: "SELECT date_key, user_id, status, rsvped_at, auto FROM rsvps WHERE date_key >= ?",
      args: [todayKey],
    }),
    // Availability is per DAY: a second night (`…_2`) reads its date's marks.
    db.execute({
      sql: `SELECT date_key, user_id, status FROM user_availability_days
             WHERE date_key IN (SELECT substr(date_key, 1, 10) FROM locked_dates
                                 WHERE unlocked_at IS NULL AND date_key >= ?)`,
      args: [todayKey],
    }),
    db.execute({
      sql: `SELECT date_key, user_id, game_slug, reaction, created_at, headcount FROM game_requests
             WHERE date_key IN (SELECT date_key FROM locked_dates
                                 WHERE unlocked_at IS NULL AND date_key >= ?)`,
      args: [todayKey],
    }),
    db.execute({
      sql: "SELECT date_key, user_id FROM exit_game_votes WHERE date_key >= ?",
      args: [todayKey],
    }),
    loadNightGameInventories(db),
    loadPickerFilterInputs(db),
    latestPoll(),
    db.execute(
      "SELECT user_id, COUNT(*) AS open FROM admin_member_notes WHERE done_at IS NULL GROUP BY user_id",
    ),
    db.execute("SELECT user_id FROM user_inventory WHERE json_array_length(game_slugs_json) > 0"),
  ]);

  const members = parseRows(MemberRowSchema, membersRes.rows, "user.outstanding");
  const items = new Map<string, OutstandingItem[]>(members.map((m) => [m.id, []]));
  const push = (userId: string, list: readonly OutstandingItem[]) =>
    items.get(userId)?.push(...list);

  const rsvpsByNight = groupBy(parseRows(RsvpRowSchema, rsvpRes.rows, "rsvps"), (r) => r.date_key);
  const availabilityByDay = groupBy(
    parseRows(AvailabilityRowSchema, availabilityRes.rows, "user_availability_days"),
    (r) => r.date_key,
  );
  const reactionsByNight = groupBy(
    parseRows(ReactionRowSchema, reactionRes.rows, "game_requests"),
    (r) => r.date_key,
  );
  const exitVotesByNight = groupBy(
    parseRows(ExitVoteRowSchema, exitRes.rows, "exit_game_votes"),
    (r) => r.date_key,
  );

  for (const lock of allLocks.values()) {
    if (nightDate(lock.dateKey) < todayKey) continue;
    const rsvps = rsvpsByNight.get(lock.dateKey) ?? [];
    const availability = availabilityByDay.get(nightDate(lock.dateKey)) ?? [];
    const reactions = reactionsByNight.get(lock.dateKey) ?? [];
    const participants = deriveNightParticipants(lock, rsvps, availability);
    const sealed = sealedAt(lock) !== null;
    const voting = !sealed && !lock.fixedGameSlug;
    const { playableSlugs, topGameSlug } = nightLineupLeader({
      lock,
      participants,
      inventoryByUser,
      pickerFilters,
      reactions,
    });

    // The admin view's stale-vote chips: counted votes (a voter's, on a game
    // still on offer) cast when the headcount was not what it is now.
    const headcount = participants.window.lo;
    const staleVotes = new Map<string, number>();
    const hyped = new Set<string>();
    for (const r of reactions) {
      if (r.reaction === "hype") hyped.add(r.user_id);
      if (!participants.voters.has(r.user_id) || !playableSlugs.has(r.game_slug)) continue;
      if (r.headcount !== null && r.headcount !== headcount) {
        staleVotes.set(r.user_id, (staleVotes.get(r.user_id) ?? 0) + 1);
      }
    }

    const perMember = nightOutstanding({
      dateKey: lock.dateKey,
      title: lock.title,
      isPrivate: lock.isPrivate,
      hostUserId: lock.hostUserId,
      eventTime: lock.eventTime,
      address: lock.address,
      expectedUserIds: lock.expectedUserIds,
      definite: participants.definite,
      tentative: participants.tentative,
      invitedNoAnswer: participants.invitedNoAnswer,
      voters: participants.voters,
      voting,
      exitAttendees:
        sealed && topGameSlug === EXIT_CATALOG_SLUG
          ? exitAttendees(lock, participants, rsvps, availability)
          : null,
      answeredByHand: new Set(
        rsvps.filter((r) => r.status === "no" || !r.auto).map((r) => r.user_id),
      ),
      saidNo: new Set(rsvps.filter((r) => r.status === "no").map((r) => r.user_id)),
      hyped,
      staleVotes,
      exitVoted: new Set((exitVotesByNight.get(lock.dateKey) ?? []).map((r) => r.user_id)),
    });
    for (const [userId, list] of perMember) push(userId, list);
  }

  // The purchase poll: the same members its reminder card nags (admins and
  // online-only members are exempt — greetings.ts).
  if (poll && poll.closed_at === null) {
    const cast = new Map<string, number>();
    for (const v of await pollVotes(poll.id)) cast.set(v.user_id, (cast.get(v.user_id) ?? 0) + 1);
    for (const m of members) {
      if (m.role === "admin" || m.onlineMode === "online") continue;
      const votesLeft = VOTES_PER_PLAYER - (cast.get(m.id) ?? 0);
      if (votesLeft > 0) {
        push(m.id, [
          {
            kind: "purchase-vote",
            pollId: poll.id,
            title: poll.title || null,
            votesLeft,
            votesTotal: VOTES_PER_PLAYER,
          },
        ]);
      }
    }
  }

  // A member who never said what they own leaves every night's picker short.
  const declared = new Set(
    parseRows(UserIdRowSchema, declaredRes.rows, "user_inventory").map((r) => r.user_id),
  );
  for (const m of members) {
    if (m.onlineMode !== "online" && !declared.has(m.id)) push(m.id, [{ kind: "collection" }]);
  }

  const openNotes = new Map(
    parseRows(NoteCountRowSchema, notesRes.rows, "admin_member_notes").map(
      (r) => [r.user_id, r.open] as const,
    ),
  );
  const out: Record<string, MemberOutstanding> = {};
  for (const m of members) {
    out[m.id] = {
      items: sortOutstanding(items.get(m.id) ?? []),
      openNotes: openNotes.get(m.id) ?? 0,
    };
  }
  return out;
}
