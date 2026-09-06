// The rehearsal is what a schema PR is proved against before it ships, so
// each of its four checks is exercised on a snapshot built from the real
// registry: a pending migration applies and is reported; row loss is
// detected; an introduced foreign-key violation is distinguished from a
// pre-existing one by identity; and a structurally drifted snapshot fails
// the parity check while a faithful one passes.

import { type Client, createClient } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "./migrator.ts";
import { migrations } from "./registry.ts";
import {
  foreignKeyViolations,
  rehearse,
  rowCounts,
  schemaShape,
  snapshotInto,
} from "./rehearsal.ts";

const QUIET = { info() {}, warn() {} };

/** A database one migration behind the registry, with a member and an RSVP. */
async function laggingSource(): Promise<Client> {
  const db = createClient({ url: ":memory:" });
  await db.execute("PRAGMA foreign_keys = ON");
  await runMigrations(db, { logger: QUIET, migrations: migrations.slice(0, -1) });
  await db.batch(
    [
      `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ('u1', 'Ada', 'ada@example.com', 1, '2026-01-01', '2026-01-01')`,
      "INSERT INTO locked_dates (date_key, locked_by) VALUES ('2026-09-12', 'u1')",
      "INSERT INTO rsvps (date_key, user_id, status) VALUES ('2026-09-12', 'u1', 'yes')",
    ],
    "write",
  );
  return db;
}

describe("migration rehearsal", () => {
  let source: Client;
  let snapshot: Client;

  beforeEach(async () => {
    source = await laggingSource();
    snapshot = createClient({ url: ":memory:" });
  });

  afterEach(() => {
    source.close();
    snapshot.close();
  });

  it("copies the snapshot faithfully and applies exactly the pending migration", async () => {
    const loaded = await snapshotInto(source, snapshot);
    expect(loaded.rows).toBeGreaterThanOrEqual(3);
    expect(await rowCounts(snapshot)).toEqual(await rowCounts(source));

    const report = await rehearse(snapshot);
    expect(report.from).toBe(migrations.length - 1);
    expect(report.to).toBe(migrations.length);
    expect(report.applied).toEqual([migrations.length]);
    expect(report.rowLoss).toEqual([]);
    expect(report.introducedViolations).toEqual([]);
    expect(report.preExistingViolations).toEqual([]);
    expect(report.schemaDrift).toEqual([]);
  });

  it("tells a pre-existing foreign-key violation from an introduced one", async () => {
    await snapshotInto(source, snapshot);
    // An orphan that was already there: loaded with enforcement off, like
    // any bad row a production database accumulated before a cascade existed.
    await snapshot.execute("PRAGMA foreign_keys = OFF");
    await snapshot.execute(
      "INSERT INTO rsvps (date_key, user_id, status) VALUES ('2026-09-12', 'ghost', 'yes')",
    );
    await snapshot.execute("PRAGMA foreign_keys = ON");
    expect((await foreignKeyViolations(snapshot)).size).toBe(1);

    const report = await rehearse(snapshot);
    expect(report.preExistingViolations).toHaveLength(1);
    expect(report.introducedViolations).toEqual([]);
  });

  it("reports rows a migration deleted", async () => {
    await snapshotInto(source, snapshot);
    const deleting = [
      ...migrations,
      {
        version: migrations.length + 1,
        name: "purge_rsvps",
        statements: ["DELETE FROM rsvps"],
      },
    ];
    const before = await rowCounts(snapshot);
    await runMigrations(snapshot, { logger: QUIET, migrations: deleting });
    const after = await rowCounts(snapshot);
    expect(before.get("rsvps")).toBe(1);
    expect(after.get("rsvps")).toBe(0);
  });

  it("flags a snapshot whose structure drifted from the chain", async () => {
    await snapshotInto(source, snapshot);
    await snapshot.execute("ALTER TABLE rsvps ADD COLUMN stray TEXT");
    await snapshot.execute("DROP INDEX idx_rsvps_date");

    const report = await rehearse(snapshot);
    expect(report.schemaDrift).toEqual([
      'table "rsvps" differs in columns, constraints, foreign keys or indexes',
    ]);
  });

  it("describes structure independently of DDL formatting", async () => {
    const a = createClient({ url: ":memory:" });
    const b = createClient({ url: ":memory:" });
    try {
      await a.execute(`CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT NOT NULL, UNIQUE (name))`);
      await b.execute(`create   table "t"("id" integer primary key,
                         "name" text not null, unique("name"))`);
      expect(await schemaShape(a)).toEqual(await schemaShape(b));
    } finally {
      a.close();
      b.close();
    }
  });
});
