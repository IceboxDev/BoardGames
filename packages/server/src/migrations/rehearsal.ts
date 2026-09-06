// Migration rehearsal: apply the pending migrations to a COPY of a real
// database and report what they would do to it. The library behind
// `migrate:dry-run` (dry-run.ts), kept pure so it is unit-tested.
//
// Four checks, each answering a question the from-empty chain test cannot:
//
//   1. Does the chain apply on this data at all? (an UPDATE that assumes a
//      value shape, a rebuild whose INSERT … SELECT trips a CHECK)
//   2. Does it lose rows? Every table's count before and after; a table
//      that shrank is reported and fails the run unless allowed.
//   3. Does it introduce a foreign-key violation? Violations are compared
//      by IDENTITY (table, rowid, parent, fk index), not by count — a
//      migration that fixed one and caused another must not net to zero.
//   4. Does the result match a database migrated from empty? The STRUCTURE
//      (columns, constraints, foreign keys, indexes) is compared, so a
//      production database that drifted — a manual ALTER, a stamped baseline
//      whose real DDL differs — is caught. DDL text is not compared: prod's
//      `sqlite_master.sql` is whatever text created it years ago.

import { type Client, createClient, type InValue } from "@libsql/client";
import { runMigrations } from "./migrator.ts";
import { LATEST_VERSION } from "./registry.ts";

const QUIET = { info() {}, warn() {} };

export interface RehearsalLogger {
  readonly info: (message: string) => void;
}

/** Copy schema + data from `source` into an empty `target`. FK checks are
 *  disabled during the bulk load (order-independent), then re-enabled so the
 *  post-migration `foreign_key_check` is meaningful. Reads only from `source`. */
export async function snapshotInto(
  source: Client,
  target: Client,
  logger: RehearsalLogger = { info() {} },
): Promise<{ tables: number; rows: number }> {
  await target.execute("PRAGMA foreign_keys = OFF");
  const schema = await source.execute(
    `SELECT type, name, sql FROM sqlite_master
     WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
     ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END, name`,
  );
  for (const row of schema.rows) await target.execute(String(row.sql));

  const tables = await source.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  let rows = 0;
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
    rows += res.rows.length;
    logger.info(`copied ${res.rows.length} rows from "${table}"`);
  }
  await target.execute("PRAGMA foreign_keys = ON");
  return { tables: tables.rows.length, rows };
}

export async function rowCounts(client: Client): Promise<Map<string, number>> {
  const { rows: tables } = await client.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  const counts = new Map<string, number>();
  for (const t of tables) {
    const table = String(t.name);
    const { rows } = await client.execute(`SELECT COUNT(*) AS n FROM "${table}"`);
    counts.set(table, Number(rows[0]?.n ?? 0));
  }
  return counts;
}

/** `PRAGMA foreign_key_check` rows as identity strings. */
export async function foreignKeyViolations(client: Client): Promise<Set<string>> {
  const { rows } = await client.execute("PRAGMA foreign_key_check");
  return new Set(rows.map((r) => `${r.table}#${r.rowid}→${r.parent}[fk${r.fkid}]`));
}

/**
 * A structural description of every table: columns (name, declared type,
 * NOT NULL, default, PK position), foreign keys, and indexes with their
 * columns, uniqueness and partial-ness. Canonical JSON, so two databases with
 * the same structure produce the same string regardless of DDL formatting.
 */
export async function schemaShape(client: Client): Promise<Record<string, string>> {
  const { rows: tables } = await client.execute(
    `SELECT name FROM sqlite_master WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%' AND name NOT IN ('schema_migrations', 'schema_migrations_lock')
      ORDER BY name`,
  );
  const shape: Record<string, string> = {};
  for (const t of tables) {
    const table = String(t.name);
    const columns = (await client.execute(`PRAGMA table_info("${table}")`)).rows.map((c) => ({
      name: c.name,
      type: String(c.type ?? "").toUpperCase(),
      notNull: Number(c.notnull),
      default: c.dflt_value ?? null,
      pk: Number(c.pk),
    }));
    const foreignKeys = (await client.execute(`PRAGMA foreign_key_list("${table}")`)).rows
      .map((fk) => ({
        from: fk.from,
        table: fk.table,
        to: fk.to,
        onDelete: fk.on_delete,
        onUpdate: fk.on_update,
      }))
      .sort((a, b) => String(a.from).localeCompare(String(b.from)));
    const indexRows = (await client.execute(`PRAGMA index_list("${table}")`)).rows;
    const indexes = [];
    for (const idx of indexRows) {
      const name = String(idx.name);
      const cols = (await client.execute(`PRAGMA index_info("${name}")`)).rows.map((c) => c.name);
      indexes.push({
        // Auto-indexes are named by position; identify them by shape instead.
        name: name.startsWith("sqlite_autoindex_") ? `auto:${cols.join(",")}` : name,
        unique: Number(idx.unique),
        partial: Number(idx.partial),
        origin: idx.origin,
        columns: cols,
      });
    }
    indexes.sort((a, b) => a.name.localeCompare(b.name));
    shape[table] = JSON.stringify({ columns, foreignKeys, indexes });
  }
  return shape;
}

export interface RehearsalReport {
  readonly from: number;
  readonly to: number;
  readonly applied: readonly number[];
  readonly elapsedMs: number;
  readonly rowLoss: readonly { table: string; before: number; after: number }[];
  readonly preExistingViolations: readonly string[];
  readonly introducedViolations: readonly string[];
  readonly schemaDrift: readonly string[];
}

/**
 * Apply the pending migrations to `snapshot` (already loaded, FK on) and
 * measure the four checks. `snapshot` is mutated; callers pass a throwaway.
 */
export async function rehearse(snapshot: Client): Promise<RehearsalReport> {
  const before = await rowCounts(snapshot);
  const preViolations = await foreignKeyViolations(snapshot);

  const startedAt = Date.now();
  const result = await runMigrations(snapshot, { logger: QUIET });
  const elapsedMs = Date.now() - startedAt;

  const after = await rowCounts(snapshot);
  const rowLoss = [...before]
    .filter(([table, n]) => (after.get(table) ?? 0) < n)
    .map(([table, n]) => ({ table, before: n, after: after.get(table) ?? 0 }));

  const postViolations = await foreignKeyViolations(snapshot);
  const introducedViolations = [...postViolations].filter((v) => !preViolations.has(v)).sort();

  const fresh = createClient({ url: ":memory:" });
  let schemaDrift: string[] = [];
  try {
    await fresh.execute("PRAGMA foreign_keys = ON");
    await runMigrations(fresh, { logger: QUIET });
    const [expected, actual] = await Promise.all([schemaShape(fresh), schemaShape(snapshot)]);
    const tables = new Set([...Object.keys(expected), ...Object.keys(actual)]);
    schemaDrift = [...tables]
      .filter((t) => expected[t] !== actual[t])
      .map((t) =>
        expected[t] === undefined
          ? `table "${t}" exists in the snapshot but not in a fresh database`
          : actual[t] === undefined
            ? `table "${t}" is missing from the snapshot`
            : `table "${t}" differs in columns, constraints, foreign keys or indexes`,
      )
      .sort();
  } finally {
    fresh.close();
  }

  return {
    from: result.from,
    to: result.to,
    applied: result.applied,
    elapsedMs,
    rowLoss,
    preExistingViolations: [...preViolations].sort(),
    introducedViolations,
    schemaDrift,
  };
}

export { LATEST_VERSION };
