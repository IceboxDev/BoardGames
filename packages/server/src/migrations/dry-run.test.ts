// The migration-safety CI gate.
//
// Runs the ENTIRE registry against a fresh in-memory database with foreign-key
// enforcement ON (matching Turso's default — verified live), proving that:
//   • every migration's SQL is valid and applies from scratch,
//   • the chain leaves the DB at exactly LATEST_VERSION (boot assertion passes),
//   • every baseline table exists,
//   • re-running is a clean no-op (idempotent),
//   • the final schema has no foreign-key violations.
//
// This is what turns "a broken migration ships and the next deploy fails against
// prod" into "a red test in CI". Complements migrator.test.ts (which tests the
// runner's mechanics with synthetic migrations); this tests the REAL registry.

import { type Client, createClient } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BASELINE_TABLES } from "./0001-baseline.ts";
import { assertAtLatestVersion, runMigrations } from "./migrator.ts";
import { LATEST_VERSION, migrations } from "./registry.ts";

describe("migration chain — full registry from empty", () => {
  let db: Client;

  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    // Mirror production: Turso enforces foreign keys (verified `PRAGMA
    // foreign_keys` == 1 live). Without this, a rebuild migration that would
    // violate an FK on prod could pass the dry-run silently.
    await db.execute("PRAGMA foreign_keys = ON");
  });

  afterEach(() => {
    db.close();
  });

  it("applies the entire registry from an empty database", async () => {
    const result = await runMigrations(db);
    expect(result.from).toBe(0);
    expect(result.to).toBe(LATEST_VERSION);
    expect(result.applied).toEqual(migrations.map((m) => m.version));
    // A truly empty DB executes the baseline DDL; it is NOT stamped.
    expect(result.stampedBaseline).toBe(false);
  });

  it("leaves the database at the latest version so server boot passes", async () => {
    await runMigrations(db);
    await expect(assertAtLatestVersion(db)).resolves.toBeUndefined();
  });

  it("creates every table the baseline contract declares", async () => {
    await runMigrations(db);
    for (const table of Object.keys(BASELINE_TABLES)) {
      const { rows } = await db.execute({
        sql: "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
        args: [table],
      });
      expect(rows.length, `expected table "${table}" to exist after migration`).toBe(1);
    }
  });

  it("is idempotent — a second run applies nothing", async () => {
    await runMigrations(db);
    const again = await runMigrations(db);
    expect(again.applied).toEqual([]);
    expect(again.to).toBe(LATEST_VERSION);
  });

  it("produces a schema with no foreign-key violations", async () => {
    await runMigrations(db);
    const { rows } = await db.execute("PRAGMA foreign_key_check");
    expect(rows, `foreign_key_check reported violations: ${JSON.stringify(rows)}`).toEqual([]);
  });
});
