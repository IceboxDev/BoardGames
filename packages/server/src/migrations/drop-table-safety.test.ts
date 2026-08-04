/**
 * Guards a latent data-loss landmine in the table-rebuild pattern.
 *
 * Migrations 0011-0013 rebuild a table the SQLite way:
 *
 *     CREATE TABLE t_new (...)          -- with the new constraints
 *     INSERT INTO t_new SELECT ... FROM t
 *     DROP TABLE t
 *     ALTER TABLE t_new RENAME TO t
 *
 * Every migration is applied as ONE `db.batch(..., "write")`, i.e. inside an
 * implicit transaction — and `PRAGMA foreign_keys` CANNOT be toggled inside a
 * transaction. So the `DROP TABLE` runs with enforcement ON. If any other
 * table has an `ON DELETE CASCADE` reference to `t`, the drop silently
 * cascades and deletes those rows, inside a migration that then COMMITS
 * SUCCESSFULLY. There is no error, and (see docs/database-operations.md) no
 * backup to recover from.
 *
 * Those three migrations were safe only because nothing referenced their
 * tables at the time — 0013's own header says so. That is no longer true in
 * general: `dnd_campaigns` now has five cascading dependents. This test makes
 * the next person's rebuild fail here instead of in production.
 */

import { type Client, createClient } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrations } from "./registry.ts";

const DROP_TABLE = /^\s*DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?["'`[]?([A-Za-z_][A-Za-z0-9_]*)["'`\]]?/i;

function droppedTable(statement: string): string | null {
  return statement.match(DROP_TABLE)?.[1] ?? null;
}

/** Tables holding a foreign key that points at `target`. */
async function tablesReferencing(db: Client, target: string): Promise<string[]> {
  const { rows } = await db.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
  );

  const referrers: string[] = [];
  for (const row of rows) {
    const table = String(row.name);
    if (table === target) continue;
    const fks = await db.execute(`PRAGMA foreign_key_list("${table}")`);
    if (fks.rows.some((fk) => String(fk.table).toLowerCase() === target.toLowerCase())) {
      referrers.push(table);
    }
  }
  return referrers;
}

describe("DROP TABLE safety across the migration chain", () => {
  let db: Client;

  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    // Mirror production: Turso enforces foreign keys.
    await db.execute("PRAGMA foreign_keys = ON");
  });

  afterEach(() => {
    db.close();
  });

  it("never drops a table that another table references", async () => {
    for (const migration of migrations) {
      for (const statement of migration.statements) {
        const target = droppedTable(statement);
        if (!target) continue;

        const referrers = await tablesReferencing(db, target);
        expect(
          referrers,
          `Migration ${migration.version} (${migration.name}) drops "${target}", which is ` +
            `referenced by ${referrers.join(", ")}. Inside a batch, foreign keys cannot be ` +
            `switched off, so this DROP cascades and deletes those rows while the migration ` +
            `reports success. Rebuild the table without dropping it (add columns / use a new ` +
            `table and migrate readers), or drop the referencing constraints first in an ` +
            `earlier migration.`,
        ).toEqual([]);
      }

      // Apply exactly as the runner does, so the next iteration sees the real
      // post-migration schema.
      await db.batch([...migration.statements], "write");
    }
  });

  it("leaves the chain with foreign keys enforced", async () => {
    for (const migration of migrations) {
      await db.batch([...migration.statements], "write");
    }
    const { rows } = await db.execute("PRAGMA foreign_key_check");
    expect(rows).toEqual([]);
  });
});
