/**
 * The chess opening trainer's tables (migrations 0055, 0057): the member's
 * linked lichess account, their imported games, their opening trees and their
 * folder library.
 */
import {
  type ImportedGame,
  TrainerSpeedSchema,
} from "@boardgames/core/games/chess/trainer/imported-game";
import {
  EMPTY_LIBRARY,
  type Library,
  LibrarySchema,
} from "@boardgames/core/games/chess/trainer/library";
import { legalPrefix } from "@boardgames/core/games/chess/trainer/position-index";
import {
  type RepertoireTree,
  RepertoireTreeSchema,
  type TreeSettings,
  TreeSettingsSchema,
  TreeStatsSchema,
} from "@boardgames/core/games/chess/trainer/tree";
import {
  CHESS_GAMES_PAGE,
  type ChessTrainerGame,
  ChessTrainerGameSchema,
  type LichessLink,
  type Repertoire,
  type RepertoireSummary,
} from "@boardgames/core/protocol";
import type { Client } from "@libsql/client";
import { z } from "zod";
import { jsonColumn, parseRow, parseRows } from "../db-rows.ts";

const LinkRowSchema = z.object({
  lichess_id: z.string(),
  lichess_username: z.string(),
  linked_at: z.string(),
});

export async function readLink(db: Client, userId: string): Promise<LichessLink | null> {
  const res = await db.execute({
    sql: "SELECT lichess_id, lichess_username, linked_at FROM chess_lichess_links WHERE user_id = ?",
    args: [userId],
  });
  const first = res.rows[0];
  if (!first) return null;
  const row = parseRow(LinkRowSchema, first, "chess_lichess_links");
  const counts = await db.execute({
    sql: `SELECT color, speed, COUNT(*) AS n, MAX(played_at_ms) AS newest
          FROM chess_imported_games WHERE user_id = ? GROUP BY color, speed`,
    args: [userId],
  });
  const groups = parseRows(
    z.object({ color: z.enum(["w", "b"]), speed: z.string(), n: z.number(), newest: z.number() }),
    counts.rows,
    "chess_imported_games.counts",
  );
  const byColor = { w: 0, b: 0 };
  const bySpeed: LichessLink["bySpeed"] = {};
  let newest: number | null = null;
  for (const g of groups) {
    byColor[g.color] += g.n;
    const speed = TrainerSpeedSchema.safeParse(g.speed);
    if (speed.success) bySpeed[speed.data] = (bySpeed[speed.data] ?? 0) + g.n;
    newest = Math.max(newest ?? 0, g.newest);
  }
  return {
    lichessId: row.lichess_id,
    username: row.lichess_username,
    linkedAt: row.linked_at,
    gamesCount: byColor.w + byColor.b,
    newestGameAt: newest,
    byColor,
    bySpeed,
  };
}

/**
 * Link (or re-link) a lichess account. Linking a different account than
 * before drops the old account's games — a tree is built from one account.
 */
export async function writeLink(
  db: Client,
  userId: string,
  lichessId: string,
  username: string,
): Promise<void> {
  const res = await db.execute({
    sql: "SELECT lichess_id FROM chess_lichess_links WHERE user_id = ?",
    args: [userId],
  });
  const previous = res.rows[0]?.lichess_id;
  const statements = [];
  if (previous !== undefined && previous !== lichessId) {
    statements.push({ sql: "DELETE FROM chess_imported_games WHERE user_id = ?", args: [userId] });
  }
  statements.push({
    sql: `INSERT INTO chess_lichess_links (user_id, lichess_id, lichess_username)
          VALUES (?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET
            lichess_id = excluded.lichess_id,
            lichess_username = excluded.lichess_username,
            linked_at = CASE WHEN chess_lichess_links.lichess_id = excluded.lichess_id
                             THEN chess_lichess_links.linked_at ELSE datetime('now') END`,
    args: [userId, lichessId, username],
  });
  await db.batch(statements, "write");
}

/** Unlink: the account and its games go; the member's trees stay. */
export async function deleteLink(db: Client, userId: string): Promise<void> {
  await db.batch(
    [
      { sql: "DELETE FROM chess_imported_games WHERE user_id = ?", args: [userId] },
      { sql: "DELETE FROM chess_lichess_links WHERE user_id = ?", args: [userId] },
    ],
    "write",
  );
}

const ROWS_PER_INSERT = 100;

/**
 * Store games, ignoring ones already stored. Returns how many were new. Each
 * game keeps only its legal moves from the start, checked here once, so the
 * trainer can index stored games without replaying every move's legality.
 */
export async function insertGames(
  db: Client,
  userId: string,
  games: readonly ImportedGame[],
): Promise<number> {
  const statements = [];
  for (let i = 0; i < games.length; i += ROWS_PER_INSERT) {
    const chunk = games.slice(i, i + ROWS_PER_INSERT);
    statements.push({
      sql: `INSERT INTO chess_imported_games
              (user_id, game_id, color, uci, played_at_ms, speed, rated, result, opponent, opponent_rating)
            VALUES ${chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ")}
            ON CONFLICT(user_id, game_id) DO NOTHING`,
      args: chunk.flatMap((g) => [
        userId,
        g.id,
        g.color,
        legalPrefix(g.uci).join(" "),
        g.playedAt,
        g.speed,
        g.rated ? 1 : 0,
        g.result,
        g.opponent,
        g.opponentRating,
      ]),
    });
  }
  const results = await db.batch(statements, "write");
  return results.reduce((n, r) => n + r.rowsAffected, 0);
}

const GameRowSchema = z.object({
  game_id: z.string(),
  uci: z.string(),
  result: z.string(),
  speed: z.string(),
  played_at_ms: z.number(),
});

/** One page of the member's games as `color`, oldest first. */
export async function readGamesPage(
  db: Client,
  userId: string,
  color: "w" | "b",
  cursor: string | undefined,
): Promise<{ games: ChessTrainerGame[]; next: string | null }> {
  const [atText, afterId] = cursor ? cursor.split(":") : ["-1", ""];
  const res = await db.execute({
    sql: `SELECT game_id, uci, result, speed, played_at_ms FROM chess_imported_games
          WHERE user_id = ? AND color = ? AND (played_at_ms, game_id) > (?, ?)
          ORDER BY played_at_ms, game_id LIMIT ?`,
    args: [userId, color, Number(atText), afterId ?? "", CHESS_GAMES_PAGE],
  });
  const rows = parseRows(GameRowSchema, res.rows, "chess_imported_games");
  const games = rows.flatMap((r) => {
    const g = ChessTrainerGameSchema.safeParse({
      id: r.game_id,
      uci: r.uci,
      result: r.result,
      speed: r.speed,
      playedAt: r.played_at_ms,
    });
    return g.success ? [g.data] : [];
  });
  const last = rows.at(-1);
  const next =
    res.rows.length === CHESS_GAMES_PAGE && last ? `${last.played_at_ms}:${last.game_id}` : null;
  return { games, next };
}

const SummaryRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.enum(["w", "b"]),
  status: z.enum(["new", "generating", "analysing", "decisions", "ready"]),
  stats_json: jsonColumn(TreeStatsSchema).nullable(),
  version: z.number(),
  updated_at: z.string(),
});
type SummaryRow = z.infer<typeof SummaryRowSchema>;

const toSummary = (r: SummaryRow): RepertoireSummary => ({
  id: r.id,
  name: r.name,
  color: r.color,
  status: r.status,
  stats: r.stats_json,
  version: r.version,
  updatedAt: r.updated_at,
});

const SUMMARY_COLUMNS = "id, name, color, status, stats_json, version, updated_at";

export async function listRepertoires(db: Client, userId: string): Promise<RepertoireSummary[]> {
  const res = await db.execute({
    sql: `SELECT ${SUMMARY_COLUMNS} FROM chess_repertoires WHERE user_id = ? ORDER BY updated_at DESC`,
    args: [userId],
  });
  return parseRows(SummaryRowSchema, res.rows, "chess_repertoires").map(toSummary);
}

const FullRowSchema = SummaryRowSchema.extend({
  settings_json: jsonColumn(TreeSettingsSchema),
  tree_json: jsonColumn(RepertoireTreeSchema).nullable(),
});

export async function readRepertoire(
  db: Client,
  userId: string,
  id: string,
): Promise<Repertoire | null> {
  const res = await db.execute({
    sql: `SELECT ${SUMMARY_COLUMNS}, settings_json, tree_json FROM chess_repertoires
          WHERE id = ? AND user_id = ?`,
    args: [id, userId],
  });
  const first = res.rows[0];
  if (!first) return null;
  const row = parseRow(FullRowSchema, first, "chess_repertoires");
  return { ...toSummary(row), settings: row.settings_json, tree: row.tree_json };
}

export async function createRepertoire(
  db: Client,
  userId: string,
  input: { name: string; color: "w" | "b"; settings: TreeSettings },
): Promise<string> {
  const id = crypto.randomUUID();
  await db.execute({
    sql: `INSERT INTO chess_repertoires (id, user_id, name, color, settings_json)
          VALUES (?, ?, ?, ?, ?)`,
    args: [id, userId, input.name, input.color, JSON.stringify(input.settings)],
  });
  return id;
}

export type UpdateResult =
  | { ok: true; version: number }
  | { ok: false; reason: "missing" | "conflict" };

/** Save a rename and/or a tree, if nobody saved since `expectedVersion`. */
export async function updateRepertoire(
  db: Client,
  userId: string,
  id: string,
  patch: {
    expectedVersion: number;
    name?: string;
    settings?: TreeSettings;
    tree?: RepertoireTree;
  },
): Promise<UpdateResult> {
  const sets = ["version = version + 1", "updated_at = datetime('now')"];
  const args: (string | number)[] = [];
  if (patch.name !== undefined) {
    sets.push("name = ?");
    args.push(patch.name);
  }
  if (patch.settings !== undefined) {
    sets.push("settings_json = ?");
    args.push(JSON.stringify(patch.settings));
  }
  if (patch.tree !== undefined) {
    sets.push("tree_json = ?", "stats_json = ?", "status = ?");
    args.push(JSON.stringify(patch.tree), JSON.stringify(patch.tree.stats), patch.tree.status);
  }
  const res = await db.execute({
    sql: `UPDATE chess_repertoires SET ${sets.join(", ")}
          WHERE id = ? AND user_id = ? AND version = ?`,
    args: [...args, id, userId, patch.expectedVersion],
  });
  if (res.rowsAffected === 1) return { ok: true, version: patch.expectedVersion + 1 };
  const exists = await db.execute({
    sql: "SELECT 1 FROM chess_repertoires WHERE id = ? AND user_id = ?",
    args: [id, userId],
  });
  return { ok: false, reason: exists.rows.length > 0 ? "conflict" : "missing" };
}

export async function deleteRepertoire(db: Client, userId: string, id: string): Promise<boolean> {
  const res = await db.execute({
    sql: "DELETE FROM chess_repertoires WHERE id = ? AND user_id = ?",
    args: [id, userId],
  });
  return res.rowsAffected > 0;
}

const LibraryRowSchema = z.object({ doc_json: jsonColumn(LibrarySchema), version: z.number() });

/** The member's folders and lines (empty, version 0, before the first save). */
export async function readLibrary(
  db: Client,
  userId: string,
): Promise<{ library: Library; version: number }> {
  const res = await db.execute({
    sql: "SELECT doc_json, version FROM chess_trainer_library WHERE user_id = ?",
    args: [userId],
  });
  const row = res.rows[0];
  if (!row) return { library: EMPTY_LIBRARY, version: 0 };
  const r = parseRow(LibraryRowSchema, row, "chess_trainer_library");
  return { library: r.doc_json, version: r.version };
}

/** Save the library, if nobody saved since `expectedVersion` (0 = never saved). */
export async function writeLibrary(
  db: Client,
  userId: string,
  expectedVersion: number,
  library: Library,
): Promise<{ ok: true; version: number } | { ok: false }> {
  const doc = JSON.stringify(library);
  const res =
    expectedVersion === 0
      ? await db.execute({
          sql: `INSERT INTO chess_trainer_library (user_id, doc_json) VALUES (?, ?)
                ON CONFLICT (user_id) DO NOTHING`,
          args: [userId, doc],
        })
      : await db.execute({
          sql: `UPDATE chess_trainer_library
                SET doc_json = ?, version = version + 1, updated_at = datetime('now')
                WHERE user_id = ? AND version = ?`,
          args: [doc, userId, expectedVersion],
        });
  return res.rowsAffected === 1 ? { ok: true, version: expectedVersion + 1 } : { ok: false };
}
