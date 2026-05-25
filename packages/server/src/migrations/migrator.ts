// Forward-only, atomic, lock-guarded migration runner for libsql / Turso.
//
// Design constraints and guarantees:
//
//   • Atomicity per migration. libsql over HTTP has no reliable interactive
//     transactions, but `batch(stmts, "write")` is all-or-nothing. Each
//     migration is applied as ONE batch containing its DDL/DML AND the row that
//     records it in `schema_migrations`. So a migration either fully applies and
//     is recorded, or neither — there is no "applied but unrecorded" state to
//     recover from.
//
//   • Baseline stamping. An existing (pre-migration-system) database already has
//     the v1 schema. Re-running v1's DDL there is pointless and risky, so the
//     runner detects that case, VERIFIES every expected table/column is present
//     (refusing if not), and records v1 as applied WITHOUT executing any DDL. A
//     truly empty database instead executes v1 normally.
//
//   • Concurrency safety. A single-row lock table serializes runners, so two
//     instances booting at once can't both issue DDL (the failure mode that the
//     old boot-time migrate() had with its conditional ALTERs).
//
//   • Immutability. Every applied migration's checksum is stored. If a shipped
//     migration's definition later changes, or the database has a version this
//     build doesn't know about, the runner refuses to proceed rather than risk
//     divergence.

import { createHash, randomUUID } from "node:crypto";
import { hostname } from "node:os";
import type { Client, InStatement } from "@libsql/client";
import { BASELINE_SENTINEL_TABLE, BASELINE_TABLES } from "./0001-baseline.ts";
import { LATEST_VERSION, migrations as registryMigrations } from "./registry.ts";
import type { Migration } from "./types.ts";

const MIGRATIONS_TABLE = "schema_migrations";
const LOCK_TABLE = "schema_migrations_lock";

const DEFAULT_LOCK_TIMEOUT_MS = 30_000;
const LOCK_POLL_INTERVAL_MS = 250;
// A lock older than this is assumed abandoned (the holder crashed mid-run) and
// is stolen. Generous enough that a legitimately slow migration won't be stolen
// out from under a live runner.
const STALE_LOCK_MS = 5 * 60_000;

export interface MigrationLogger {
  info(message: string): void;
  warn(message: string): void;
}

export interface RunMigrationsOptions {
  /** Override the migration set (tests only). Defaults to the real registry. */
  readonly migrations?: readonly Migration[];
  readonly logger?: MigrationLogger;
  readonly lockTimeoutMs?: number;
}

export interface RunMigrationsResult {
  /** Version the database was at before this run. */
  readonly from: number;
  /** Version the database is at after this run. */
  readonly to: number;
  /** Versions executed this run (excludes a stamped baseline). */
  readonly applied: number[];
  /** True if an existing database was stamped at the baseline this run. */
  readonly stampedBaseline: boolean;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** sha256 of a migration's statements. Identifies the migration's content so a
 *  later edit to an applied migration is detectable. */
function checksum(migration: Migration): string {
  return createHash("sha256").update(JSON.stringify(migration.statements)).digest("hex");
}

async function tableExists(db: Client, name: string): Promise<boolean> {
  const { rows } = await db.execute({
    sql: "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
    args: [name],
  });
  return rows.length > 0;
}

async function ensureBookkeeping(db: Client): Promise<void> {
  // The only unconditional DDL the runner ever issues. Idempotent and safe to
  // run on every invocation, including against production.
  await db.batch(
    [
      `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
         version INTEGER PRIMARY KEY,
         name TEXT NOT NULL,
         checksum TEXT NOT NULL,
         applied_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`,
      `CREATE TABLE IF NOT EXISTS ${LOCK_TABLE} (
         id INTEGER PRIMARY KEY CHECK (id = 1),
         locked INTEGER NOT NULL DEFAULT 0,
         locked_at TEXT,
         locked_by TEXT
       )`,
      `INSERT OR IGNORE INTO ${LOCK_TABLE} (id, locked) VALUES (1, 0)`,
    ],
    "write",
  );
}

async function acquireLock(
  db: Client,
  owner: string,
  timeoutMs: number,
  logger: MigrationLogger,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    // Atomic compare-and-set: only the runner that flips 0 → 1 wins.
    const res = await db.execute({
      sql: `UPDATE ${LOCK_TABLE} SET locked = 1, locked_at = datetime('now'), locked_by = ?
            WHERE id = 1 AND locked = 0`,
      args: [owner],
    });
    if (res.rowsAffected === 1) return;

    const { rows } = await db.execute(
      `SELECT locked_by, CAST(strftime('%s','now') - strftime('%s', locked_at) AS INTEGER) AS age_s
       FROM ${LOCK_TABLE} WHERE id = 1`,
    );
    const holder = rows[0]?.locked_by == null ? "unknown" : String(rows[0].locked_by);
    const ageS = rows[0]?.age_s == null ? 0 : Number(rows[0].age_s);

    if (ageS * 1000 >= STALE_LOCK_MS) {
      logger.warn(
        `[migrate] stealing stale migration lock held by "${holder}" for ${ageS}s (assumed crashed)`,
      );
      const stolen = await db.execute({
        sql: `UPDATE ${LOCK_TABLE} SET locked = 1, locked_at = datetime('now'), locked_by = ?
              WHERE id = 1 AND locked_by = ?`,
        args: [owner, holder],
      });
      if (stolen.rowsAffected === 1) return;
    }

    if (Date.now() >= deadline) {
      throw new Error(
        `[migrate] could not acquire migration lock within ${timeoutMs}ms (held by "${holder}"). Another migration is in progress, or a previous run crashed — if you are sure none is running, clear the row in ${LOCK_TABLE}.`,
      );
    }
    await sleep(LOCK_POLL_INTERVAL_MS);
  }
}

async function releaseLock(db: Client, owner: string): Promise<void> {
  await db.execute({
    sql: `UPDATE ${LOCK_TABLE} SET locked = 0, locked_at = NULL, locked_by = NULL
          WHERE id = 1 AND locked_by = ?`,
    args: [owner],
  });
}

interface AppliedRow {
  readonly name: string;
  readonly checksum: string;
}

async function getApplied(db: Client): Promise<Map<number, AppliedRow>> {
  const { rows } = await db.execute(
    `SELECT version, name, checksum FROM ${MIGRATIONS_TABLE} ORDER BY version`,
  );
  const map = new Map<number, AppliedRow>();
  for (const row of rows) {
    map.set(Number(row.version), {
      name: String(row.name),
      checksum: String(row.checksum),
    });
  }
  return map;
}

/** Throw unless every table/column the baseline declares already exists. Guards
 *  the stamp path: we never declare a non-conforming database "baselined". */
async function verifyBaselinePresent(db: Client): Promise<void> {
  const missing: string[] = [];
  for (const [table, columns] of Object.entries(BASELINE_TABLES)) {
    // Table name is a constant from our own baseline definition, not user input.
    const info = await db.execute(`PRAGMA table_info("${table}")`);
    if (info.rows.length === 0) {
      missing.push(`table "${table}"`);
      continue;
    }
    const present = new Set(info.rows.map((r) => String(r.name)));
    for (const col of columns) {
      if (!present.has(col)) missing.push(`"${table}"."${col}"`);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `[migrate] refusing to baseline: the existing database does not match migration v1. Missing: ${missing.join(", ")}. Investigate manually — do NOT stamp a database that doesn't already have the baseline schema.`,
    );
  }
}

function recordStatement(migration: Migration): InStatement {
  return {
    sql: `INSERT INTO ${MIGRATIONS_TABLE} (version, name, checksum, applied_at)
          VALUES (?, ?, ?, datetime('now'))`,
    args: [migration.version, migration.name, checksum(migration)],
  };
}

/** Apply one migration: all its statements + its bookkeeping row, atomically. */
async function applyMigration(db: Client, migration: Migration): Promise<void> {
  const batch: InStatement[] = [
    ...migration.statements.map((sql): InStatement => sql),
    recordStatement(migration),
  ];
  await db.batch(batch, "write");
}

/** Record a migration as applied WITHOUT executing its statements (baseline
 *  stamp on an existing database). */
async function stampMigration(db: Client, migration: Migration): Promise<void> {
  await db.execute(recordStatement(migration));
}

/**
 * Bring the database up to the latest migration. Safe to call repeatedly and
 * concurrently; a no-op when already current.
 */
export async function runMigrations(
  db: Client,
  options: RunMigrationsOptions = {},
): Promise<RunMigrationsResult> {
  const migrations = options.migrations ?? registryMigrations;
  const logger = options.logger ?? console;
  const lockTimeoutMs = options.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
  const owner = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
  const latest = migrations.length;

  await ensureBookkeeping(db);
  await acquireLock(db, owner, lockTimeoutMs, logger);
  try {
    const applied = await getApplied(db);

    // Integrity: applied migrations must match their current definitions.
    for (const migration of migrations) {
      const row = applied.get(migration.version);
      if (!row) continue;
      if (row.checksum !== checksum(migration)) {
        throw new Error(
          `[migrate] migration v${migration.version} ("${migration.name}") was modified after being applied (checksum mismatch). Applied migrations are immutable — revert the change and add a NEW migration instead.`,
        );
      }
      if (row.name !== migration.name) {
        throw new Error(
          `[migrate] migration v${migration.version} was applied as "${row.name}" but is now named "${migration.name}". Names of applied migrations are immutable.`,
        );
      }
    }
    // The database must not be ahead of this build.
    for (const version of applied.keys()) {
      if (!migrations.some((m) => m.version === version)) {
        throw new Error(
          `[migrate] the database has migration v${version} applied, but this build only knows up to v${latest}. This server is OLDER than the database — deploy the newer build. Refusing to continue.`,
        );
      }
    }

    let stampedBaseline = false;
    // Baseline stamp: nothing applied yet, but the schema is already here.
    if (applied.size === 0 && migrations.length > 0 && migrations[0].version === 1) {
      const legacy = await tableExists(db, BASELINE_SENTINEL_TABLE);
      if (legacy) {
        await verifyBaselinePresent(db);
        await stampMigration(db, migrations[0]);
        applied.set(migrations[0].version, {
          name: migrations[0].name,
          checksum: checksum(migrations[0]),
        });
        stampedBaseline = true;
        logger.info(
          `[migrate] existing database baselined at v1 ("${migrations[0].name}") — no DDL executed`,
        );
      }
    }

    const from = applied.size === 0 ? 0 : Math.max(...applied.keys());
    const pending = migrations.filter((m) => !applied.has(m.version));

    const appliedNow: number[] = [];
    for (const migration of pending) {
      await applyMigration(db, migration);
      appliedNow.push(migration.version);
      logger.info(`[migrate] applied v${migration.version} ("${migration.name}")`);
    }

    const to = appliedNow.length > 0 ? Math.max(...appliedNow) : from;
    if (appliedNow.length === 0 && !stampedBaseline) {
      logger.info(`[migrate] database already up to date at v${to}`);
    }
    return { from, to, applied: appliedNow, stampedBaseline };
  } finally {
    await releaseLock(db, owner);
  }
}

/**
 * Read-only assertion for server boot: the database must be exactly at the
 * latest known version. Does NOT mutate anything and does NOT take the lock.
 * Throws with an actionable message if migrations need to be run (or if the
 * database is ahead of this build).
 */
export async function assertAtLatestVersion(
  db: Client,
  options: { migrations?: readonly Migration[] } = {},
): Promise<void> {
  const latest = options.migrations ? options.migrations.length : LATEST_VERSION;

  if (!(await tableExists(db, MIGRATIONS_TABLE))) {
    throw new Error(
      `[migrate] "${MIGRATIONS_TABLE}" table is missing — the database has never been migrated. Run \`pnpm --filter @boardgames/server migrate\` before starting the server.`,
    );
  }
  const { rows } = await db.execute(`SELECT MAX(version) AS v FROM ${MIGRATIONS_TABLE}`);
  const current = rows[0]?.v == null ? 0 : Number(rows[0].v);

  if (current < latest) {
    throw new Error(
      `[migrate] database is at v${current} but this build requires v${latest}. Run \`pnpm --filter @boardgames/server migrate\` before starting the server.`,
    );
  }
  if (current > latest) {
    throw new Error(
      `[migrate] database is at v${current}, ahead of this build (v${latest}). This server is older than the database — deploy the newer build.`,
    );
  }
}

// Exported for tests.
export const __test__ = {
  MIGRATIONS_TABLE,
  LOCK_TABLE,
  checksum,
  acquireLock,
  releaseLock,
  ensureBookkeeping,
};
