/**
 * The online match store: every finished server-run game, how it ended and who
 * sat where. Written once per game by the session manager; read by the match
 * history page and the replay viewer.
 */

import {
  type GameOutcome,
  GameOutcomeSchema,
  seatPlacement,
  seatResult,
  seatScore,
} from "@boardgames/core/machines/outcome";
import type { MatchSeat, MatchSummary } from "@boardgames/core/protocol";
import type { InStatement } from "@libsql/client";
import { z } from "zod";
import { getDb } from "../db.ts";
import { jsonColumn, parseRow, parseRows } from "../lib/db-rows.ts";
import { legacyOutcome } from "./legacy-outcome.ts";

/** A seat as the session knew it: who sat there, as an account or an AI. */
export interface RecordedSeat {
  readonly kind: "human" | "ai";
  /** The account in a human seat; `null` for AI (and any unauthenticated seat). */
  readonly userId: string | null;
  readonly strategy: string | null;
}

export interface FinishedMatch {
  readonly gameSlug: string;
  readonly seed: number;
  readonly outcome: GameOutcome;
  /** The game's own replay log (`GameMachineSpec.getReplayLog`). */
  readonly log: unknown;
  readonly seats: readonly RecordedSeat[];
}

/** Save a finished game and its seats in one write; resolves to the replay id. */
export async function saveMatch(match: FinishedMatch): Promise<number> {
  const seatRows: InStatement[] = match.seats.map((seat, i) => ({
    // Same batch as the insert above it, so MAX(id) is that row.
    sql: `INSERT INTO replay_seats (replay_id, seat, kind, user_id, strategy, result, placement, score)
          VALUES ((SELECT MAX(id) FROM session_replays), ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      i,
      seat.kind,
      seat.userId,
      seat.strategy,
      seatResult(match.outcome, i),
      seatPlacement(match.outcome, i),
      seatScore(match.outcome, i),
    ],
  }));

  const [inserted] = await getDb().batch(
    [
      {
        sql: `INSERT INTO session_replays (game_slug, replay_json, outcome_json, seed, player_count)
              VALUES (?, ?, ?, ?, ?) RETURNING id`,
        args: [
          match.gameSlug,
          JSON.stringify(match.log),
          JSON.stringify(match.outcome),
          match.seed,
          match.seats.length,
        ],
      },
      ...seatRows,
    ],
    "write",
  );
  const row = inserted?.rows[0];
  if (!row) throw new Error("session_replays insert returned no id");
  return parseRow(z.object({ id: z.number() }), row, "session_replays.RETURNING").id;
}

const MatchRowSchema = z.object({
  id: z.number(),
  game_slug: z.string(),
  created_at: z.string(),
  player_count: z.number().nullable(),
  outcome_json: jsonColumn(GameOutcomeSchema).nullable(),
  winner: z.string().nullable(),
  scores_json: jsonColumn(z.array(z.number())).nullable(),
});

const SeatRowSchema = z.object({
  replay_id: z.number(),
  seat: z.number(),
  kind: z.enum(["human", "ai"]),
  user_id: z.string().nullable(),
  strategy: z.string().nullable(),
  name: z.string().nullable(),
});

/**
 * The account's finished games of one kind, newest first: those it sat in,
 * plus games saved before seats were recorded (whoever played them).
 */
export async function listMatches(
  gameSlug: string,
  viewerId: string,
  limit: number,
): Promise<MatchSummary[]> {
  const db = getDb();
  const { rows } = await db.execute({
    sql: `SELECT r.id, r.game_slug, r.created_at, r.player_count, r.outcome_json, r.winner, r.scores_json
            FROM session_replays r
           WHERE r.game_slug = ?
             AND (EXISTS (SELECT 1 FROM replay_seats s WHERE s.replay_id = r.id AND s.user_id = ?)
                  OR NOT EXISTS (SELECT 1 FROM replay_seats s WHERE s.replay_id = r.id))
           ORDER BY r.created_at DESC, r.id DESC
           LIMIT ?`,
    args: [gameSlug, viewerId, limit],
  });
  const matches = parseRows(MatchRowSchema, rows, "session_replays");
  if (matches.length === 0) return [];

  const ids = matches.map((m) => m.id);
  const seatQuery = await db.execute({
    sql: `SELECT s.replay_id, s.seat, s.kind, s.user_id, s.strategy, u.name
            FROM replay_seats s
            LEFT JOIN "user" u ON u.id = s.user_id
           WHERE s.replay_id IN (${ids.map(() => "?").join(", ")})
           ORDER BY s.replay_id, s.seat`,
    args: ids,
  });
  const seatsByReplay = new Map<number, MatchSeat[]>();
  for (const s of parseRows(SeatRowSchema, seatQuery.rows, "replay_seats")) {
    const list = seatsByReplay.get(s.replay_id) ?? [];
    list.push({
      seat: s.seat,
      kind: s.kind,
      strategy: s.strategy,
      name: s.kind === "human" ? s.name : null,
      isViewer: s.user_id === viewerId,
    });
    seatsByReplay.set(s.replay_id, list);
  }

  return matches.map((m): MatchSummary => {
    const seats = seatsByReplay.get(m.id) ?? [];
    const outcome =
      m.outcome_json ??
      legacyOutcome({
        gameSlug: m.game_slug,
        winner: m.winner,
        playerCount: m.player_count,
        scores: m.scores_json,
      });
    // A legacy row has no seats; its solo player always held seat 0.
    const viewerSeat = seats.length === 0 ? 0 : (seats.find((s) => s.isViewer)?.seat ?? null);
    return {
      id: m.id,
      createdAt: m.created_at,
      playerCount: m.player_count ?? (seats.length || 2),
      outcome,
      seats,
      viewerSeat,
    };
  });
}

const LogRowSchema = z.object({ replay_json: jsonColumn(z.unknown()) });

/** One game's replay log, or `null` when there is no such game of this kind. */
export async function getMatchLog(gameSlug: string, id: number): Promise<unknown | null> {
  const { rows } = await getDb().execute({
    // Scoped by slug too — the id alone would return any game's replay.
    sql: "SELECT replay_json FROM session_replays WHERE id = ? AND game_slug = ?",
    args: [id, gameSlug],
  });
  const row = rows[0];
  return row ? parseRow(LogRowSchema, row, "session_replays").replay_json : null;
}
