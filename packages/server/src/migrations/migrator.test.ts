import { type Client, createClient } from "@libsql/client";
import { afterEach, describe, expect, it } from "vitest";
import { BASELINE_TABLES, baseline } from "./0001-baseline.ts";
import { __test__, assertAtLatestVersion, runMigrations } from "./migrator.ts";
import { LATEST_VERSION } from "./registry.ts";
import type { Migration } from "./types.ts";

const { MIGRATIONS_TABLE, LOCK_TABLE, acquireLock, ensureBookkeeping, releaseLock } = __test__;

// Quiet logger so test output stays clean.
const silent = { info: () => {}, warn: () => {} };

let clients: Client[] = [];
function freshDb(): Client {
  const db = createClient({ url: ":memory:" });
  clients.push(db);
  return db;
}
afterEach(() => {
  for (const c of clients) c.close();
  clients = [];
});

async function tableNames(db: Client): Promise<Set<string>> {
  const { rows } = await db.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
  );
  return new Set(rows.map((r) => String(r.name)));
}
async function indexNames(db: Client): Promise<Set<string>> {
  const { rows } = await db.execute(
    "SELECT name FROM sqlite_master WHERE type='index' AND sql IS NOT NULL",
  );
  return new Set(rows.map((r) => String(r.name)));
}
async function columnsOf(db: Client, table: string): Promise<string[]> {
  const { rows } = await db.execute(`PRAGMA table_info("${table}")`);
  return rows.map((r) => String(r.name));
}

// Small synthetic migrations for generic runner behavior (no "rsvps" sentinel,
// so the baseline-stamp path never triggers — these always execute).
const m1: Migration = {
  version: 1,
  name: "init",
  statements: ["CREATE TABLE t1 (id INTEGER PRIMARY KEY, val TEXT)"],
};
const m2: Migration = {
  version: 2,
  name: "add_t2",
  statements: ["CREATE TABLE t2 (id INTEGER PRIMARY KEY)", "CREATE INDEX idx_t2 ON t2(id)"],
};

describe("runMigrations — generic behavior", () => {
  it("applies all pending migrations on a fresh database", async () => {
    const db = freshDb();
    const result = await runMigrations(db, { migrations: [m1, m2], logger: silent });

    expect(result).toEqual({ from: 0, to: 2, applied: [1, 2], stampedBaseline: false });
    const tables = await tableNames(db);
    expect(tables.has("t1")).toBe(true);
    expect(tables.has("t2")).toBe(true);
    expect(tables.has(MIGRATIONS_TABLE)).toBe(true);
    expect(tables.has(LOCK_TABLE)).toBe(true);
  });

  it("is idempotent — a second run changes nothing", async () => {
    const db = freshDb();
    await runMigrations(db, { migrations: [m1, m2], logger: silent });
    const before = await tableNames(db);

    const result = await runMigrations(db, { migrations: [m1, m2], logger: silent });
    expect(result).toEqual({ from: 2, to: 2, applied: [], stampedBaseline: false });
    expect(await tableNames(db)).toEqual(before);

    const { rows } = await db.execute(`SELECT COUNT(*) AS n FROM ${MIGRATIONS_TABLE}`);
    expect(Number(rows[0].n)).toBe(2);
  });

  it("applies only newly-added migrations on a subsequent run", async () => {
    const db = freshDb();
    await runMigrations(db, { migrations: [m1], logger: silent });
    const result = await runMigrations(db, { migrations: [m1, m2], logger: silent });
    expect(result).toEqual({ from: 1, to: 2, applied: [2], stampedBaseline: false });
  });

  it("releases the lock after a successful run (next run can proceed)", async () => {
    const db = freshDb();
    await runMigrations(db, { migrations: [m1], logger: silent });
    const { rows } = await db.execute(`SELECT locked FROM ${LOCK_TABLE} WHERE id = 1`);
    expect(Number(rows[0].locked)).toBe(0);
  });

  it("releases the lock even when a migration throws", async () => {
    const db = freshDb();
    const bad: Migration = { version: 1, name: "bad", statements: ["CREATE TABLE ("] };
    await expect(runMigrations(db, { migrations: [bad], logger: silent })).rejects.toThrow();
    const { rows } = await db.execute(`SELECT locked FROM ${LOCK_TABLE} WHERE id = 1`);
    expect(Number(rows[0].locked)).toBe(0);
    // Nothing recorded, because the failed migration's batch (statements + record) is atomic.
    const applied = await db.execute(`SELECT COUNT(*) AS n FROM ${MIGRATIONS_TABLE}`);
    expect(Number(applied.rows[0].n)).toBe(0);
  });
});

describe("runMigrations — integrity guards", () => {
  it("rejects a modified (checksum drift) applied migration", async () => {
    const db = freshDb();
    await runMigrations(db, { migrations: [m1], logger: silent });
    const tampered: Migration = {
      version: 1,
      name: "init",
      statements: ["CREATE TABLE t1 (id INTEGER PRIMARY KEY, val TEXT, extra TEXT)"],
    };
    await expect(runMigrations(db, { migrations: [tampered], logger: silent })).rejects.toThrow(
      /modified after being applied/,
    );
  });

  it("rejects a renamed applied migration", async () => {
    const db = freshDb();
    await runMigrations(db, { migrations: [m1], logger: silent });
    const renamed: Migration = { version: 1, name: "renamed", statements: m1.statements };
    await expect(runMigrations(db, { migrations: [renamed], logger: silent })).rejects.toThrow(
      /immutable/,
    );
  });

  it("rejects a database that is ahead of this build", async () => {
    const db = freshDb();
    await runMigrations(db, { migrations: [m1], logger: silent });
    // Simulate a newer deploy having applied v2, then rolling back to old code.
    await db.execute({
      sql: `INSERT INTO ${MIGRATIONS_TABLE} (version, name, checksum) VALUES (2, 'future', 'x')`,
      args: [],
    });
    await expect(runMigrations(db, { migrations: [m1], logger: silent })).rejects.toThrow(
      /OLDER than the database/,
    );
  });
});

describe("runMigrations — baseline stamping", () => {
  // Build a database that looks like pre-migration-system production: the full
  // baseline schema present, but no schema_migrations table.
  async function legacyDb(): Promise<Client> {
    const db = freshDb();
    await db.batch([...baseline.statements], "write");
    return db;
  }

  it("stamps an existing database at v1 WITHOUT executing baseline DDL", async () => {
    const db = await legacyDb();
    // Drop an index to prove the baseline DDL is NOT re-executed on the stamp path.
    await db.execute("DROP INDEX idx_rsvps_date");
    // Put a row in place to prove data is untouched.
    await db.execute({
      sql: "INSERT INTO rsvps (date_key, user_id, status) VALUES ('2026-01-01', 'u1', 'yes')",
      args: [],
    });

    const result = await runMigrations(db, { migrations: [baseline], logger: silent });
    expect(result.stampedBaseline).toBe(true);
    expect(result.applied).toEqual([]);
    expect(result.to).toBe(1);

    // Index stays dropped → baseline DDL did not run.
    expect((await indexNames(db)).has("idx_rsvps_date")).toBe(false);
    // Data preserved.
    const { rows } = await db.execute("SELECT COUNT(*) AS n FROM rsvps");
    expect(Number(rows[0].n)).toBe(1);
    // Recorded as applied.
    const mig = await db.execute(`SELECT version, name FROM ${MIGRATIONS_TABLE}`);
    expect(mig.rows.map((r) => [Number(r.version), r.name])).toEqual([[1, "baseline"]]);
  });

  it("does NOT stamp a truly fresh database — it executes the baseline", async () => {
    const db = freshDb();
    const result = await runMigrations(db, { migrations: [baseline], logger: silent });
    expect(result.stampedBaseline).toBe(false);
    expect(result.applied).toEqual([1]);
    expect((await tableNames(db)).has("rsvps")).toBe(true);
    expect((await indexNames(db)).has("idx_rsvps_date")).toBe(true);
  });

  it("refuses to stamp a database missing baseline objects", async () => {
    const db = freshDb();
    // Only the sentinel table exists — a malformed/partial database.
    await db.execute(
      "CREATE TABLE rsvps (date_key TEXT, user_id TEXT, PRIMARY KEY(date_key, user_id))",
    );
    await expect(runMigrations(db, { migrations: [baseline], logger: silent })).rejects.toThrow(
      /refusing to baseline/,
    );
  });
});

describe("baseline definition fidelity", () => {
  it("CREATE statements produce exactly the columns declared in BASELINE_TABLES", async () => {
    const db = freshDb();
    await runMigrations(db, { migrations: [baseline], logger: silent });
    for (const [table, expectedCols] of Object.entries(BASELINE_TABLES)) {
      const actual = await columnsOf(db, table);
      expect(actual, `columns of ${table}`).toEqual([...expectedCols]);
    }
  });

  it("creates every expected index", async () => {
    const db = freshDb();
    await runMigrations(db, { migrations: [baseline], logger: silent });
    const idx = await indexNames(db);
    for (const name of [
      "account_userId_idx",
      "session_userId_idx",
      "verification_identifier_idx",
      "idx_bgg_cache_bgg_id",
      "idx_calendar_feed_tokens_hash",
      "idx_game_requests_date",
      "idx_game_results_client_id",
      "idx_game_results_slug",
      "idx_match_results_date_key",
      "idx_match_results_game_slug",
      "idx_match_results_played_at",
      "idx_rsvps_date",
      "idx_session_replays_slug",
      "idx_tournament_games_tid",
      "idx_tournaments_slug",
      "idx_tournaments_status",
    ]) {
      expect(idx.has(name), `index ${name}`).toBe(true);
    }
  });

  it("enforces the rsvps.status and game_requests.reaction CHECK constraints", async () => {
    const db = freshDb();
    await runMigrations(db, { migrations: [baseline], logger: silent });
    await expect(
      db.execute({
        sql: "INSERT INTO rsvps (date_key, user_id, status) VALUES ('2026-01-01','u1','maybe')",
        args: [],
      }),
    ).rejects.toThrow();
    await expect(
      db.execute({
        sql: "INSERT INTO game_requests (date_key, user_id, game_slug, reaction) VALUES ('2026-01-01','u1','set','bogus')",
        args: [],
      }),
    ).rejects.toThrow();
  });
});

describe("full registry (production migrations)", () => {
  it("brings a fresh database to the latest version", async () => {
    const db = freshDb();
    const result = await runMigrations(db, { logger: silent });
    expect(result.to).toBe(LATEST_VERSION);
    expect((await tableNames(db)).has("rsvps")).toBe(true);
  });

  it("v2 drops test_dummy when present", async () => {
    const db = freshDb();
    await db.execute("CREATE TABLE test_dummy (id INTEGER PRIMARY KEY)");
    await runMigrations(db, { logger: silent });
    expect((await tableNames(db)).has("test_dummy")).toBe(false);
  });

  it("is idempotent on the real registry", async () => {
    const db = freshDb();
    await runMigrations(db, { logger: silent });
    const again = await runMigrations(db, { logger: silent });
    expect(again.applied).toEqual([]);
    expect(again.to).toBe(LATEST_VERSION);
  });
});

describe("assertAtLatestVersion", () => {
  it("throws when the database has never been migrated", async () => {
    const db = freshDb();
    await expect(assertAtLatestVersion(db, { migrations: [m1] })).rejects.toThrow(
      /never been migrated/,
    );
  });

  it("passes when the database is at the latest version", async () => {
    const db = freshDb();
    await runMigrations(db, { migrations: [m1, m2], logger: silent });
    await expect(assertAtLatestVersion(db, { migrations: [m1, m2] })).resolves.toBeUndefined();
  });

  it("throws when migrations are pending", async () => {
    const db = freshDb();
    await runMigrations(db, { migrations: [m1], logger: silent });
    await expect(assertAtLatestVersion(db, { migrations: [m1, m2] })).rejects.toThrow(
      /Run .*migrate/,
    );
  });

  it("throws when the database is ahead of the build", async () => {
    const db = freshDb();
    await runMigrations(db, { migrations: [m1, m2], logger: silent });
    await expect(assertAtLatestVersion(db, { migrations: [m1] })).rejects.toThrow(/ahead of/);
  });
});

describe("migration lock", () => {
  it("serializes: a second acquire fails while held, succeeds after release", async () => {
    const db = freshDb();
    await ensureBookkeeping(db);

    await acquireLock(db, "A", 1000, silent);
    await expect(acquireLock(db, "B", 300, silent)).rejects.toThrow(/could not acquire/);

    await releaseLock(db, "A");
    await expect(acquireLock(db, "B", 1000, silent)).resolves.toBeUndefined();
    await releaseLock(db, "B");
  });
});
