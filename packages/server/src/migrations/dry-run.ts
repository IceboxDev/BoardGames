// Migration rehearsal against a REAL production snapshot.
//
//   pnpm --filter @boardgames/server migrate:dry-run
//
// Copies the production database (SELECT/PRAGMA reads ONLY — never writes to
// prod) into a throwaway in-memory DB, then runs the pending migrations against
// that copy with foreign-key enforcement ON. Reports what would be applied, how
// long it took, and — critically — whether the result has any FK violations.
//
// This is the rehearsal the review calls for: because the local .env points at
// the live database and there is no staging DB, this script is how you prove a
// schema change (especially the FK table-rebuilds) works against real data
// BEFORE running `migrate` for real at deploy time.

// Must be first: populates process.env before getDbConnectionConfig reads it.
import "../env.ts";

import { type Client, createClient, type InValue } from "@libsql/client";
import { getDbConnectionConfig } from "../db.ts";
import { runMigrations } from "./migrator.ts";
import { LATEST_VERSION } from "./registry.ts";

/** Copy schema + data from `source` into an empty `target`. FK checks are
 *  disabled during the bulk load (order-independent), then re-enabled so the
 *  post-migration `foreign_key_check` is meaningful. */
async function snapshotInto(source: Client, target: Client): Promise<void> {
  await target.execute("PRAGMA foreign_keys = OFF");

  // Schema first: tables, then indexes/triggers/views. Skip SQLite internals.
  const schema = await source.execute(
    `SELECT type, name, sql FROM sqlite_master
     WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
     ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END, name`,
  );
  for (const row of schema.rows) {
    await target.execute(String(row.sql));
  }

  // Data, one table at a time, chunked so a big table doesn't build one huge batch.
  const tables = await source.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  let totalRows = 0;
  for (const t of tables.rows) {
    const table = String(t.name);
    const res = await source.execute(`SELECT * FROM "${table}"`);
    if (res.rows.length === 0) continue;
    const cols = res.columns;
    const colList = cols.map((c) => `"${c}"`).join(", ");
    const placeholders = cols.map(() => "?").join(", ");
    const stmts = res.rows.map((row) => ({
      sql: `INSERT INTO "${table}" (${colList}) VALUES (${placeholders})`,
      args: cols.map((c) => (row as Record<string, InValue>)[c]),
    }));
    for (let i = 0; i < stmts.length; i += 500) {
      await target.batch(stmts.slice(i, i + 500), "write");
    }
    totalRows += res.rows.length;
    console.log(`[dry-run]   copied ${res.rows.length} rows from "${table}"`);
  }
  console.log(`[dry-run] snapshot loaded: ${totalRows} rows across ${tables.rows.length} tables`);

  await target.execute("PRAGMA foreign_keys = ON");
}

const { url, authToken } = getDbConnectionConfig();
const source = createClient({ url, authToken });
const target = createClient({ url: ":memory:" });

let failed = false;
try {
  console.log("[dry-run] copying the production snapshot into memory (prod is read-only here)…");
  await snapshotInto(source, target);

  const beforeRes = await target.execute(
    "SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations",
  );
  const before = Number(beforeRes.rows[0]?.v ?? 0);
  console.log(`[dry-run] snapshot is at v${before}; this build defines up to v${LATEST_VERSION}`);

  const preViolations = await target.execute("PRAGMA foreign_key_check");
  if (preViolations.rows.length > 0) {
    console.warn(
      `[dry-run] ⚠ snapshot ALREADY has ${preViolations.rows.length} FK violation(s) before migrating (pre-existing prod data issue):`,
    );
    console.dir(preViolations.rows.slice(0, 20), { depth: null });
  }

  const startedAt = Date.now();
  const result = await runMigrations(target);
  const elapsedMs = Date.now() - startedAt;
  const appliedLabel = result.applied.length > 0 ? `v${result.applied.join(", v")}` : "none";
  console.log(
    `[dry-run] applied ${appliedLabel} in ${elapsedMs}ms — snapshot now at v${result.to}`,
  );

  const postViolations = await target.execute("PRAGMA foreign_key_check");
  const introduced = postViolations.rows.length - preViolations.rows.length;
  if (introduced > 0) {
    failed = true;
    console.error(
      `[dry-run] ❌ migration would INTRODUCE ${introduced} foreign-key violation(s) on real prod data:`,
    );
    console.dir(postViolations.rows.slice(0, 20), { depth: null });
  } else {
    console.log(
      "[dry-run] ✅ no NEW foreign-key violations — these migrations are safe against current prod data",
    );
  }
} catch (err) {
  failed = true;
  console.error("[dry-run] ❌ migration failed against the prod snapshot:");
  console.error(err instanceof Error ? err.message : String(err));
} finally {
  source.close();
  target.close();
}

process.exit(failed ? 1 : 0);
