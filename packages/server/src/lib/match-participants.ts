// Dual-write helpers for `match_participants` (migration 0024).
//
// The table is a materialized index of `extractParticipantIds(outcome)` — the
// only thing that makes "every match this user played" an index seek instead of
// a full scan of `match_results`. It is only safe as an index if it can never
// diverge from the row it indexes, so every statement built here MUST go into
// the SAME `db.batch([...], "write")` as the `match_results` write it mirrors.
//
// The match is addressed by an *expression*, not a number, because an INSERT
// only learns its id via RETURNING and a batch cannot feed one statement's
// output into the next.

import { extractParticipantIds } from "@boardgames/core/history/participant-results";
import type { MatchOutcome } from "@boardgames/core/history/types";
import type { InStatement, InValue } from "@libsql/client";

/** `match_results` projection matching `MatchResultRowSchema`, aliased `m`. */
const MATCH_COLS = `m.id, m.date_key, m.played_at, m.game_slug, m.game_title, m.outcome_json,
     m.notes, m.recorded_by, m.recorded_at, m.updated_at, m.sort_order`;

/**
 * "Every match this user took part in", newest first — the read the index
 * exists for. Membership is a WHERE clause, not a post-filter, so `limit + 1`
 * is a truthful hasMore probe and keyset paging on `before` can't skip a row.
 *
 * Omitting `limit` returns the user's whole history: profile stats aggregate
 * over all of it and win/loss is derived in JS from the full outcome, so it
 * can't be pushed into a GROUP BY. The join still bounds the read to one
 * member's matches rather than the table.
 */
export function userMatchesQuery(params: {
  readonly userId: string;
  readonly before?: string | undefined;
  readonly limit?: number | undefined;
}): InStatement {
  const { userId, before, limit } = params;
  const args: InValue[] = [userId];
  let sql = `SELECT ${MATCH_COLS}
       FROM match_results m
       JOIN match_participants p ON p.match_id = m.id
      WHERE p.user_id = ?`;
  if (before !== undefined) {
    sql += " AND m.played_at < ?";
    args.push(before);
  }
  sql += " ORDER BY m.played_at DESC, m.id DESC";
  if (limit !== undefined) {
    sql += " LIMIT ?";
    args.push(limit);
  }
  return { sql, args };
}

/** A SQL expression resolving to one `match_results.id`, plus its bound args. */
export interface MatchIdExpr {
  readonly sql: string;
  readonly args: readonly InValue[];
}

export function matchIdOf(id: number): MatchIdExpr {
  return { sql: "?", args: [id] };
}

/**
 * The row an idempotent record-match INSERT landed on — the freshly inserted
 * one, or the row a retried submit conflicted with. Both carry this client_id.
 */
export function matchIdOfClientId(clientId: string): MatchIdExpr {
  return { sql: "(SELECT id FROM match_results WHERE client_id = ?)", args: [clientId] };
}

/**
 * The row a non-idempotent (null client_id) INSERT just created. `id` is
 * AUTOINCREMENT, so the new row always holds the maximum; SQLite serializes
 * writers, so no other insert can slip in before the rest of this batch runs.
 */
export function newestMatchId(): MatchIdExpr {
  return { sql: "(SELECT MAX(id) FROM match_results)", args: [] };
}

/**
 * Statements that make the participant index for one match exactly
 * `extractParticipantIds(outcome)`. `replace` is required whenever the outcome
 * may have changed (an edit can drop a player), and harmless on insert.
 */
export function participantSyncStatements(
  match: MatchIdExpr,
  outcome: MatchOutcome,
  options: { readonly replace?: boolean } = {},
): InStatement[] {
  const statements: InStatement[] = [];
  if (options.replace) {
    statements.push({
      sql: `DELETE FROM match_participants WHERE match_id = ${match.sql}`,
      args: [...match.args],
    });
  }
  for (const userId of extractParticipantIds(outcome)) {
    // The `SELECT … FROM match_results` guard keeps a non-existent match (a
    // client_id that resolved to NULL) from tripping the foreign key.
    statements.push({
      sql: `INSERT OR IGNORE INTO match_participants (match_id, user_id)
            SELECT id, ? FROM match_results WHERE id = ${match.sql}`,
      args: [userId, ...match.args],
    });
  }
  return statements;
}
