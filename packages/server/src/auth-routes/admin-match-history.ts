import type { MatchOutcome, MatchRecord } from "@boardgames/core/history/types";
import { MatchReorderInputSchema, MatchReorderResponseSchema } from "@boardgames/core/protocol";
import { z } from "zod";
import { adminApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { parseRow, parseRows } from "../lib/db-rows.ts";
import { errorResponse, zJsonBody } from "../lib/error-response.ts";
import { MatchResultRowSchema, rowToMatchRecord } from "./match-history.ts";
import {
  collectUserIds,
  isValidDateKey,
  isValidGameSlug,
  isValidIsoDateTime,
  parseOutcome,
} from "./match-history-validate.ts";

export const adminMatchHistoryRoutes = adminApp();

type ParsedInput = {
  dateKey: string | null;
  playedAt: string;
  gameSlug: string | null;
  gameTitle: string;
  outcome: MatchOutcome;
  notes: string | null;
  /** Optional client-generated idempotency key. A retried submit reuses it so
   *  the record is inserted once (partial unique index on match_results). */
  clientId: string | null;
};

/** Projection used for the bulk userId existence check + name lookup. */
const UserIdRowSchema = z.object({ id: z.string() });
const UserIdNameRowSchema = z.object({ id: z.string(), name: z.string() });

async function verifyUserIdsExist(
  ids: Set<string>,
): Promise<{ ok: true } | { ok: false; missing: string[] }> {
  if (ids.size === 0) return { ok: true };
  const list = [...ids];
  const placeholders = list.map(() => "?").join(",");
  const { rows } = await getDb().execute({
    sql: `SELECT id FROM user WHERE id IN (${placeholders})`,
    args: list,
  });
  const found = new Set(parseRows(UserIdRowSchema, rows, "user.id").map((r) => r.id));
  const missing = list.filter((id) => !found.has(id));
  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}

function parseInput(
  body: unknown,
): { ok: true; value: ParsedInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "body must be an object" };
  }
  const b = body as Record<string, unknown>;

  const dateKey =
    b.dateKey === null || b.dateKey === undefined
      ? null
      : isValidDateKey(b.dateKey)
        ? b.dateKey
        : undefined;
  if (dateKey === undefined) return { ok: false, error: "invalid dateKey" };

  if (!isValidIsoDateTime(b.playedAt)) return { ok: false, error: "invalid playedAt (ISO)" };

  const gameSlug =
    b.gameSlug === null || b.gameSlug === undefined
      ? null
      : isValidGameSlug(b.gameSlug)
        ? b.gameSlug
        : undefined;
  if (gameSlug === undefined) return { ok: false, error: "invalid gameSlug" };

  if (typeof b.gameTitle !== "string") return { ok: false, error: "missing gameTitle" };
  const gameTitle = b.gameTitle.trim();
  if (gameTitle.length === 0 || gameTitle.length > 200) {
    return { ok: false, error: "gameTitle: 1-200 chars" };
  }

  const outcomeResult = parseOutcome(b.outcome);
  if (!outcomeResult.ok) return outcomeResult;

  let notes: string | null = null;
  if (b.notes !== null && b.notes !== undefined) {
    if (typeof b.notes !== "string") return { ok: false, error: "notes must be a string" };
    const t = b.notes.trim();
    notes = t.length === 0 ? null : t.slice(0, 2000);
  }

  let clientId: string | null = null;
  if (b.clientId !== null && b.clientId !== undefined) {
    if (typeof b.clientId !== "string") return { ok: false, error: "clientId must be a string" };
    const t = b.clientId.trim();
    if (t.length === 0 || t.length > 100) return { ok: false, error: "clientId: 1-100 chars" };
    clientId = t;
  }

  return {
    ok: true,
    value: {
      dateKey,
      playedAt: b.playedAt,
      gameSlug,
      gameTitle,
      outcome: outcomeResult.value,
      notes,
      clientId,
    },
  };
}

/**
 * Re-fetch a single match row by id and shape it into the wire `MatchRecord`,
 * resolving the latest display names for every referenced user. Returns
 * null when the row no longer exists (e.g. a concurrent delete).
 */
async function fetchAndShape(id: number): Promise<MatchRecord | null> {
  const db = getDb();
  const { rows } = await db.execute({
    sql: `SELECT id, date_key, played_at, game_slug, game_title, outcome_json, notes,
                 recorded_by, recorded_at, updated_at, sort_order
          FROM match_results WHERE id = ? LIMIT 1`,
    args: [id],
  });
  if (rows.length === 0) return null;

  const parsed = parseRow(MatchResultRowSchema, rows[0], "match_results");
  const ids = collectUserIds(parsed.outcome_json);
  const nameById = new Map<string, string>();
  if (ids.size > 0) {
    const list = [...ids];
    const placeholders = list.map(() => "?").join(",");
    const userRes = await db.execute({
      sql: `SELECT id, name FROM user WHERE id IN (${placeholders})`,
      args: list,
    });
    for (const r of parseRows(UserIdNameRowSchema, userRes.rows, "user.id-name")) {
      nameById.set(r.id, r.name);
    }
  }
  return rowToMatchRecord(parsed, nameById);
}

adminMatchHistoryRoutes.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = parseInput(body);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const { dateKey, playedAt, gameSlug, gameTitle, outcome, notes, clientId } = parsed.value;

  const userCheck = await verifyUserIdsExist(collectUserIds(outcome));
  if (!userCheck.ok) {
    return c.json({ error: `unknown userIds: ${userCheck.missing.join(", ")}` }, 400);
  }

  const user = c.get("user");
  // sort_order slots the new match at the TOP of its night (min - 1, or 0 when
  // it's the first), preserving the newest-first default. NULL-safe `IS` scopes
  // the subquery to standalone (NULL date_key) matches too.
  //
  // `client_id` makes the insert idempotent: a retried/double-clicked submit
  // reusing the same id conflicts on the partial unique index and DOES NOTHING;
  // we then return the already-recorded row instead of a duplicate. A null
  // client_id (older clients) isn't in the partial index, so it always inserts.
  const result = await getDb().execute({
    sql: `INSERT INTO match_results
            (date_key, played_at, game_slug, game_title, outcome_json, notes, recorded_by, recorded_at, sort_order, client_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'),
                  COALESCE((SELECT MIN(sort_order) - 1 FROM match_results WHERE date_key IS ?), 0), ?)
          ON CONFLICT(client_id) WHERE client_id IS NOT NULL DO NOTHING
          RETURNING id`,
    args: [
      dateKey,
      playedAt,
      gameSlug,
      gameTitle,
      JSON.stringify(outcome),
      notes,
      user.id,
      dateKey,
      clientId,
    ],
  });

  let insertedId: number;
  if (result.rows[0]) {
    insertedId = parseRow(
      z.object({ id: z.number() }),
      result.rows[0],
      "match_results.RETURNING",
    ).id;
  } else {
    // DO NOTHING fired → this exact submit was already recorded. Return the
    // existing row so the client sees success without creating a duplicate.
    const existing = await getDb().execute({
      sql: "SELECT id FROM match_results WHERE client_id = ? LIMIT 1",
      args: [clientId],
    });
    if (existing.rows.length === 0) {
      return c.json({ error: "insert produced no row" }, 500);
    }
    insertedId = parseRow(
      z.object({ id: z.number() }),
      existing.rows[0],
      "match_results.client_id",
    ).id;
  }
  const record = await fetchAndShape(insertedId);
  return c.json(record);
});

adminMatchHistoryRoutes.patch("/:id{[0-9]+}", async (c) => {
  const id = Number.parseInt(c.req.param("id"), 10);
  const body = await c.req.json().catch(() => null);
  const parsed = parseInput(body);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const { dateKey, playedAt, gameSlug, gameTitle, outcome, notes } = parsed.value;

  const userCheck = await verifyUserIdsExist(collectUserIds(outcome));
  if (!userCheck.ok) {
    return c.json({ error: `unknown userIds: ${userCheck.missing.join(", ")}` }, 400);
  }

  const db = getDb();
  // An edit must NOT change the match's position within its night. The one
  // exception is moving it to a *different* night (dateKey changed), where it
  // re-slots at the top of the destination — same rule as a fresh record.
  //
  // Done as ONE atomic statement: the SET RHS sees the row's PRE-update
  // `date_key`, so `date_key IS ?` detects "same night → keep sort_order",
  // otherwise the correlated subquery computes MIN(sort_order)-1 of the
  // destination (excluding this row). The previous read-then-update version
  // could race two concurrent night-moves onto the same computed slot.
  const result = await db.execute({
    sql: `UPDATE match_results
          SET date_key = ?, played_at = ?, game_slug = ?, game_title = ?,
              outcome_json = ?, notes = ?, updated_at = datetime('now'),
              sort_order = CASE
                WHEN date_key IS ? THEN sort_order
                ELSE COALESCE(
                  (SELECT MIN(m2.sort_order) - 1 FROM match_results m2
                   WHERE m2.date_key IS ? AND m2.id <> match_results.id), 0)
              END
          WHERE id = ?`,
    args: [
      dateKey,
      playedAt,
      gameSlug,
      gameTitle,
      JSON.stringify(outcome),
      notes,
      dateKey, // CASE WHEN date_key IS ? (unchanged night → keep position)
      dateKey, // subquery: MIN(sort_order) of the destination night
      id,
    ],
  });
  if (result.rowsAffected === 0) return c.json({ error: "not found" }, 404);
  const record = await fetchAndShape(id);
  return c.json(record);
});

adminMatchHistoryRoutes.delete("/:id{[0-9]+}", async (c) => {
  const id = Number.parseInt(c.req.param("id"), 10);
  const result = await getDb().execute({
    sql: "DELETE FROM match_results WHERE id = ?",
    args: [id],
  });
  if (result.rowsAffected === 0) return c.json({ error: "not found" }, 404);
  return c.json({ ok: true });
});

// Re-sort the matches inside one board game night. `orderedIds` is the full,
// top-to-bottom list of the night's match ids; we assign `sort_order = index`.
// Requiring the exact set keeps sort_order a contiguous 0..n-1 sequence and
// rejects a stale client whose page didn't hold every match in the night.
adminMatchHistoryRoutes.post("/reorder", zJsonBody(MatchReorderInputSchema), async (c) => {
  const { dateKey, orderedIds } = c.req.valid("json");

  if (new Set(orderedIds).size !== orderedIds.length) {
    return errorResponse(c, 400, "orderedIds contains duplicates", "BAD_REQUEST");
  }

  const db = getDb();
  // Validate the ids form the group being reordered. A real night is scoped by
  // its dateKey and must list EXACTLY that night's matches. A standalone bucket
  // (dateKey null) only requires every id to be an existing match with no
  // dateKey — the client sends one day's matches, and standalone sort_order is a
  // single space, so reordering a per-day subset is fine.
  if (dateKey !== null) {
    const { rows } = await db.execute({
      sql: "SELECT id FROM match_results WHERE date_key = ?",
      args: [dateKey],
    });
    const nightIds = new Set(
      parseRows(z.object({ id: z.number() }), rows, "match_results.reorder-ids").map((r) => r.id),
    );
    if (nightIds.size !== orderedIds.length || orderedIds.some((id) => !nightIds.has(id))) {
      return errorResponse(
        c,
        400,
        "orderedIds must list exactly the matches in this night",
        "BAD_REQUEST",
      );
    }
  } else {
    const placeholders = orderedIds.map(() => "?").join(",");
    const { rows } = await db.execute({
      sql: `SELECT id FROM match_results WHERE date_key IS NULL AND id IN (${placeholders})`,
      args: orderedIds,
    });
    const standaloneIds = parseRows(
      z.object({ id: z.number() }),
      rows,
      "match_results.reorder-ids",
    );
    if (standaloneIds.length !== orderedIds.length) {
      return errorResponse(c, 400, "orderedIds must all be standalone matches", "BAD_REQUEST");
    }
  }

  // Atomic all-or-nothing batch. No `updated_at` bump — reordering isn't a
  // content edit. `id` is the primary key, so it scopes each update on its own.
  await db.batch(
    orderedIds.map((id, index) => ({
      sql: "UPDATE match_results SET sort_order = ? WHERE id = ?",
      args: [index, id],
    })),
    "write",
  );

  return c.json(MatchReorderResponseSchema.parse({ ok: true }));
});
