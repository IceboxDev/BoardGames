/**
 * The shared lichess explorer cache (`chess_explorer_cache`, migration 0064):
 * one answer per position, keyed by its position key, read by every member's
 * trainer and by the analysis farm. Answers are fetched once (lichess allows
 * about one explorer request every three seconds) and kept for months: a
 * position's move statistics barely change.
 */
import { parseFen, positionKey } from "@boardgames/core/games/chess/engine/fen";
import { legalMoves } from "@boardgames/core/games/chess/engine/movegen";
import { moveToUci } from "@boardgames/core/games/chess/engine/uci";
import { type ExplorerAnswer, ExplorerAnswerSchema } from "@boardgames/core/protocol";
import type { Client, InStatement } from "@libsql/client";
import { z } from "zod";
import { jsonColumn, parseRows } from "../db-rows.ts";

/** How long an answer stays good. */
export const EXPLORER_KEEP_DAYS = 180;

const RowSchema = z.object({
  fen_key: z.string(),
  games: z.number(),
  moves_json: jsonColumn(ExplorerAnswerSchema.shape.moves),
  fetched_at: z.string(),
});

function keyOf(fen: string): string | null {
  try {
    return positionKey(parseFen(fen));
  } catch {
    return null;
  }
}

/** The cached answers for `fens` that are still fresh, keyed by the FEN asked. */
export async function lookupExplorer(
  db: Client,
  fens: readonly string[],
): Promise<Map<string, ExplorerAnswer & { fetchedAt: string }>> {
  const byKey = new Map<string, string[]>();
  for (const fen of fens) {
    const key = keyOf(fen);
    if (key) byKey.set(key, [...(byKey.get(key) ?? []), fen]);
  }
  const out = new Map<string, ExplorerAnswer & { fetchedAt: string }>();
  const keys = [...byKey.keys()];
  for (let i = 0; i < keys.length; i += 100) {
    const chunk = keys.slice(i, i + 100);
    const res = await db.execute({
      sql: `SELECT fen_key, games, moves_json, fetched_at FROM chess_explorer_cache
             WHERE fen_key IN (${chunk.map(() => "?").join(", ")})
               AND fetched_at > datetime('now', ?)`,
      args: [...chunk, `-${EXPLORER_KEEP_DAYS} days`],
    });
    for (const row of parseRows(RowSchema, res.rows, "chess_explorer_cache")) {
      for (const fen of byKey.get(row.fen_key) ?? []) {
        out.set(fen, { games: row.games, moves: row.moves_json, fetchedAt: row.fetched_at });
      }
    }
  }
  return out;
}

/**
 * Keep answers (replacing older ones). Moves illegal in the position are
 * dropped and an unreadable FEN is skipped; returns how many were kept.
 */
export async function saveExplorer(
  db: Client,
  entries: readonly (ExplorerAnswer & { fen: string })[],
): Promise<number> {
  const statements: InStatement[] = [];
  for (const e of entries) {
    const key = keyOf(e.fen);
    if (!key) continue;
    const legal = new Set(legalMoves(parseFen(e.fen)).map(moveToUci));
    const moves = e.moves
      .filter((m) => legal.has(m.uci))
      .sort((a, b) => b.white + b.draws + b.black - (a.white + a.draws + a.black));
    statements.push({
      sql: `INSERT INTO chess_explorer_cache (fen_key, games, moves_json, fetched_at)
            VALUES (?, ?, ?, datetime('now'))
            ON CONFLICT (fen_key) DO UPDATE SET
              games = excluded.games,
              moves_json = excluded.moves_json,
              fetched_at = excluded.fetched_at`,
      args: [key, e.games, JSON.stringify(moves)],
    });
  }
  if (statements.length > 0) await db.batch(statements, "write");
  return statements.length;
}
