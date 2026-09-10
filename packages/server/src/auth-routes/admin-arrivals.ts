// Admin arrivals — compose, publish and retract the "games are here" takeover.
//
//   GET    /api/admin/arrivals      → closed polls (tally, voter ids, what's
//                                     already announced) + published arrivals
//   POST   /api/admin/arrivals      → publish: 1–3 games of a closed poll, a
//                                     purchaser and a photo each
//   DELETE /api/admin/arrivals/:id  → retract (hard delete; inventories stay)
//
// Publishing is one CLAIM, in the announcement-approval shape: every
// purchaser's inventory rewrite is a compare-and-set that lands first, the
// arrival row is inserted only if every one of those landed AND the poll is
// still closed AND none of the slugs has been announced for this poll yet,
// and the game rows are inserted only if the arrival landed. The inventory
// writes carry that same "not announced yet" guard, so a duplicate publish
// changes nothing at all — not even an inventory. A lost inventory race is
// retried against a fresh read; every photo is processed BEFORE the first
// write so sharp never runs inside the retry loop.

import { randomUUID } from "node:crypto";
import {
  AdminArrivalsStateSchema,
  PublishArrivalBodySchema,
  PublishArrivalResponseSchema,
  RetractArrivalResponseSchema,
} from "@boardgames/core/protocol";
import type { InStatement, InValue } from "@libsql/client";
import { z } from "zod";
import { adminApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { logActivity } from "../lib/activity-log.ts";
import {
  ArrivalPhotoError,
  type ProcessedArrivalPhoto,
  processArrivalPhoto,
} from "../lib/arrival-photo.ts";
import {
  arrivalPhotoPath,
  arrivalSeenCounts,
  arrivedSlugsForPoll,
  listArrivals,
} from "../lib/arrivals.ts";
import { parseRows } from "../lib/db-rows.ts";
import { errorResponse, zJsonBody } from "../lib/error-response.ts";
import {
  closedPolls,
  computeTally,
  distinctVoterCount,
  type PollRow,
  pollById,
  pollVotes,
} from "../lib/purchase-vote.ts";
import { playerRefs } from "../lib/user-refs.ts";
import { inventoryAddPlan, type SqlGuard } from "./collection.ts";

/** Attempts before giving up on an inventory row that keeps changing underneath. */
const PUBLISH_ATTEMPTS = 3;
/** Closed polls offered to the composer. */
const CLOSED_POLLS_LIMIT = 10;

export const adminArrivalRoutes = adminApp();

const MemberFlagsRowSchema = z.object({
  id: z.string(),
  guest: z.union([z.number(), z.boolean()]).nullable(),
  internal: z.union([z.number(), z.boolean()]).nullable(),
});

type PollTally = { tally: ReturnType<typeof computeTally>; voterCount: number };

async function tallyOf(poll: PollRow): Promise<PollTally> {
  const votes = await pollVotes(poll.id);
  return {
    tally: computeTally(poll.candidate_slugs_json, votes),
    voterCount: distinctVoterCount(votes),
  };
}

// ── GET /api/admin/arrivals ────────────────────────────────────────────

adminArrivalRoutes.get("/", async (c) => {
  const polls = await closedPolls(CLOSED_POLLS_LIMIT);
  const arrivals = await listArrivals();
  const ids = new Set<string>();

  const tallies = new Map<number, PollTally>();
  const tallyFor = async (pollId: number): Promise<PollTally | null> => {
    const cached = tallies.get(pollId);
    if (cached) return cached;
    const poll = polls.find((p) => p.id === pollId) ?? (await pollById(pollId));
    if (!poll) return null;
    const computed = await tallyOf(poll);
    tallies.set(pollId, computed);
    return computed;
  };

  const pollsOut = [];
  for (const poll of polls) {
    if (poll.closed_at === null) continue;
    const { tally, voterCount } = await tallyOf(poll);
    tallies.set(poll.id, { tally, voterCount });
    for (const entry of tally) for (const id of entry.voterIds) ids.add(id);
    pollsOut.push({
      id: poll.id,
      createdAt: poll.created_at,
      closedAt: poll.closed_at,
      winnerSlug: poll.winner_slug,
      candidates: poll.candidate_slugs_json,
      voterCount,
      tally,
      arrivedSlugs: [...(await arrivedSlugsForPoll(poll.id))],
    });
  }

  const seen = await arrivalSeenCounts(arrivals.map((a) => a.arrival.id));
  const arrivalsOut = [];
  for (const { arrival, games } of arrivals) {
    const votes = new Map((await tallyFor(arrival.poll_id))?.tally.map((t) => [t.slug, t.votes]));
    if (arrival.published_by) ids.add(arrival.published_by);
    for (const game of games) ids.add(game.purchaser_user_id);
    arrivalsOut.push({
      id: arrival.id,
      pollId: arrival.poll_id,
      publishedAt: arrival.published_at,
      publishedBy: arrival.published_by,
      seenBy: seen.get(arrival.id) ?? 0,
      games: games.map((game) => ({
        slug: game.slug,
        purchaserUserId: game.purchaser_user_id,
        votes: votes.get(game.slug) ?? 0,
        photoUrl: arrivalPhotoPath(arrival.id, game.slug),
        placeholder: game.photo_placeholder,
        width: game.photo_w,
        height: game.photo_h,
        photoBytes: game.photo_bytes,
      })),
    });
  }

  const refs = await playerRefs(ids);
  const players = Object.fromEntries(
    Object.entries(refs).map(([id, ref]) => [id, { name: ref.name, image: ref.image }]),
  );
  return c.json(
    AdminArrivalsStateSchema.parse({ polls: pollsOut, arrivals: arrivalsOut, players }),
  );
});

// ── POST /api/admin/arrivals ───────────────────────────────────────────

adminArrivalRoutes.post("/", zJsonBody(PublishArrivalBodySchema), async (c) => {
  const admin = c.get("user");
  const body = c.req.valid("json");
  const db = getDb();

  const poll = await pollById(body.pollId);
  if (!poll) return errorResponse(c, 404, "purchase vote not found", "NOT_FOUND");
  if (poll.closed_at === null) {
    return errorResponse(c, 409, "the purchase vote is still open", "POLL_OPEN");
  }
  const candidates = new Set(poll.candidate_slugs_json);
  for (const game of body.games) {
    if (!candidates.has(game.slug)) {
      return errorResponse(c, 400, `"${game.slug}" was not on that vote`, "NOT_A_CANDIDATE");
    }
  }

  const purchaserIds = [...new Set(body.games.map((g) => g.purchaserUserId))];
  const { rows: memberRows } = await db.execute({
    sql: `SELECT id, guest, internal FROM "user" WHERE id IN (${purchaserIds.map(() => "?").join(",")})`,
    args: purchaserIds,
  });
  const members = new Map(
    parseRows(MemberFlagsRowSchema, memberRows, "user.purchasers").map((m) => [m.id, m] as const),
  );
  for (const id of purchaserIds) {
    const member = members.get(id);
    if (!member) return errorResponse(c, 400, "purchaser not found", "PURCHASER_NOT_FOUND");
    if (member.guest || member.internal) {
      return errorResponse(c, 400, "a purchaser must be a real member", "PURCHASER_NOT_MEMBER");
    }
  }

  const slugs = body.games.map((g) => g.slug);
  const alreadyArrived = async () =>
    [...(await arrivedSlugsForPoll(poll.id))].filter((slug) => slugs.includes(slug));
  const taken = await alreadyArrived();
  if (taken.length > 0) {
    return errorResponse(c, 409, `"${taken[0]}" has already been announced`, "ALREADY_ARRIVED");
  }

  // All the CPU work, before any write.
  const photos: ProcessedArrivalPhoto[] = [];
  for (const game of body.games) {
    try {
      photos.push(await processArrivalPhoto(game.photo));
    } catch (err) {
      if (err instanceof ArrivalPhotoError) {
        return errorResponse(c, 400, `${game.slug}: ${err.message}`, err.code);
      }
      throw err;
    }
  }

  const arrivalId = randomUUID();
  const slugPlaceholders = slugs.map(() => "?").join(",");
  /** Poll still closed, and none of these slugs announced for it yet. */
  const announceGuard: SqlGuard = {
    sql: `EXISTS (SELECT 1 FROM purchase_polls WHERE id = ? AND closed_at IS NOT NULL)
          AND NOT EXISTS (SELECT 1 FROM purchase_arrival_games g
                            JOIN purchase_arrivals a ON a.id = g.arrival_id
                           WHERE a.poll_id = ? AND g.slug IN (${slugPlaceholders}))`,
    args: [poll.id, poll.id, ...slugs],
  };

  for (let attempt = 1; ; attempt++) {
    const plans = [];
    for (const userId of purchaserIds) {
      const mine = body.games.filter((g) => g.purchaserUserId === userId).map((g) => g.slug);
      plans.push(await inventoryAddPlan(db, userId, mine, announceGuard));
    }
    const guardSql = [announceGuard.sql, ...plans.map((p) => p.guard.sql)].join(" AND ");
    const guardArgs: InValue[] = [
      ...announceGuard.args,
      ...plans.flatMap((p) => [...p.guard.args]),
    ];
    const statements: InStatement[] = [
      ...plans.map((p) => p.statement),
      {
        sql: `INSERT INTO purchase_arrivals (id, poll_id, published_by)
              SELECT ?, ?, ? WHERE ${guardSql}`,
        args: [arrivalId, poll.id, admin.id, ...guardArgs],
      },
      ...body.games.map((game, position) => {
        const photo = photos[position];
        if (!photo) throw new Error("photo/game count mismatch");
        return {
          sql: `INSERT INTO purchase_arrival_games
                  (arrival_id, slug, position, purchaser_user_id, photo, photo_placeholder,
                   photo_w, photo_h, photo_bytes)
                SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
                 WHERE EXISTS (SELECT 1 FROM purchase_arrivals WHERE id = ?)`,
          args: [
            arrivalId,
            game.slug,
            position,
            game.purchaserUserId,
            photo.photo,
            photo.placeholder,
            photo.width,
            photo.height,
            photo.bytes,
            arrivalId,
          ],
        } satisfies InStatement;
      }),
    ];
    const results = await db.batch(statements, "write");
    if ((results[plans.length]?.rowsAffected ?? 0) > 0) break;

    // Either a concurrent publish took one of the slugs, or an inventory
    // moved underneath one of the CAS writes.
    const raced = await alreadyArrived();
    if (raced.length > 0) {
      return errorResponse(c, 409, `"${raced[0]}" has already been announced`, "ALREADY_ARRIVED");
    }
    if (attempt >= PUBLISH_ATTEMPTS) {
      return errorResponse(
        c,
        409,
        "a collection changed while publishing — try again",
        "INVENTORY_CONFLICT",
      );
    }
  }

  logActivity(admin.id, "arrival-published", {
    arrivalId,
    pollId: poll.id,
    games: body.games.map((g) => ({ slug: g.slug, purchaserUserId: g.purchaserUserId })),
  });
  for (const game of body.games) {
    logActivity(game.purchaserUserId, "arrival-received", {
      arrivalId,
      pollId: poll.id,
      slug: game.slug,
    });
  }
  return c.json(PublishArrivalResponseSchema.parse({ ok: true, arrivalId }));
});

// ── DELETE /api/admin/arrivals/:id ─────────────────────────────────────

adminArrivalRoutes.delete("/:id", async (c) => {
  const admin = c.get("user");
  const id = c.req.param("id");
  const { rows } = await getDb().execute({
    sql: "SELECT poll_id FROM purchase_arrivals WHERE id = ? LIMIT 1",
    args: [id],
  });
  const pollId = rows[0]?.poll_id;
  // Hard delete: games and seen-marks cascade; the inventories are left as
  // they are — a set-add cannot be safely reversed (the purchaser may have
  // owned the game before), and fix-ups go through the inventory panel.
  const result = await getDb().execute({
    sql: "DELETE FROM purchase_arrivals WHERE id = ?",
    args: [id],
  });
  if (result.rowsAffected === 0) return errorResponse(c, 404, "arrival not found", "NOT_FOUND");
  logActivity(admin.id, "arrival-retracted", { arrivalId: id, pollId: Number(pollId) });
  return c.json(RetractArrivalResponseSchema.parse({ ok: true }));
});
