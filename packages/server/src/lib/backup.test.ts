// The backup is the recovery tool the team controls. These tests prove the
// three things a restore depends on: a dump of a migrated database replays
// into an identical database, awkward values survive the trip (quotes,
// unicode, NULLs, embedded JSON, numbers), and the encrypted envelope
// round-trips and rejects a wrong passphrase.

import { type Client, createClient } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../migrations/migrator.ts";
import { dumpToString, restoreDump, sqlLiteral, verifyDump } from "./backup.ts";
import { decryptBackup, encryptBackup } from "./backup-crypto.ts";

const QUIET = { info() {}, warn() {} };
const META = { source: "test", takenAt: "2026-01-01T00:00:00.000Z" };

describe("logical backup", () => {
  let db: Client;

  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await db.execute("PRAGMA foreign_keys = ON");
    await runMigrations(db, { logger: QUIET });
    await db.batch(
      [
        {
          sql: `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
                VALUES ('u1', 'O''Brien Ünïcode 🎲', 'o@example.com', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
          args: [],
        },
        {
          sql: `INSERT INTO locked_dates (date_key, locked_by, expected_user_ids_json, address, host_at_home)
                VALUES ('2026-09-12', 'u1', '["u1"]', NULL, 1)`,
          args: [],
        },
        {
          sql: "INSERT INTO rsvps (date_key, user_id, status, auto) VALUES ('2026-09-12', 'u1', 'yes', 0)",
          args: [],
        },
        {
          sql: `INSERT INTO match_results (date_key, played_at, game_slug, game_title, outcome_json, recorded_by, sort_order)
                VALUES ('2026-09-12', '2026-09-12T18:00:00.000Z', 'chess', 'Chess "Blitz"', '{"kind":"free-for-all","players":[{"userId":"u1","displayName":"O''Brien","score":1.5,"rank":1}]}', 'u1', 0)`,
          args: [],
        },
      ],
      "write",
    );
  });

  afterEach(() => {
    db.close();
  });

  it("restores to an identical database and passes its own verification", async () => {
    const sql = await dumpToString(db, META);
    expect(sql).toContain("-- boardgames logical backup");
    expect(sql).toContain("-- rsvps (1 rows)");

    const restored = await restoreDump(sql);
    try {
      const { rows } = await restored.execute(
        `SELECT u.name, m.game_title, m.outcome_json FROM match_results m JOIN "user" u ON u.id = m.recorded_by`,
      );
      expect(rows[0]).toMatchObject({
        name: "O'Brien Ünïcode 🎲",
        game_title: 'Chess "Blitz"',
      });
      expect(JSON.parse(String(rows[0]?.outcome_json)).players[0].score).toBe(1.5);
      const { rows: version } = await restored.execute(
        "SELECT MAX(version) AS v FROM schema_migrations",
      );
      const { rows: expected } = await db.execute(
        "SELECT MAX(version) AS v FROM schema_migrations",
      );
      expect(version[0]?.v).toBe(expected[0]?.v);
    } finally {
      restored.close();
    }

    const verification = await verifyDump(sql, db);
    expect(verification.problems).toEqual([]);
    expect(verification.ok).toBe(true);
  });

  it("reports a dump that does not match its source", async () => {
    const sql = await dumpToString(db, META);
    await db.execute("UPDATE rsvps SET status = 'no'");
    const verification = await verifyDump(sql, db);
    expect(verification.ok).toBe(false);
    expect(verification.problems[0]).toMatch(/first difference at line/);
  });

  it("is deterministic below the header", async () => {
    const [a, b] = await Promise.all([dumpToString(db, META), dumpToString(db, META)]);
    expect(a).toBe(b);
  });

  it("quotes every value type libsql returns", () => {
    expect(sqlLiteral(null)).toBe("NULL");
    expect(sqlLiteral(Number.NaN)).toBe("NULL");
    expect(sqlLiteral(3)).toBe("3");
    expect(sqlLiteral(12n)).toBe("12");
    expect(sqlLiteral("it's")).toBe("'it''s'");
    expect(sqlLiteral(new Uint8Array([0xde, 0xad]).buffer)).toBe("X'dead'");
    expect(sqlLiteral(new Uint8Array([0xbe, 0xef]))).toBe("X'beef'");
  });
});

describe("backup encryption", () => {
  const passphrase = "correct horse battery staple";

  it("round-trips and authenticates", () => {
    const plaintext = Buffer.from("INSERT INTO rsvps VALUES ('x');\n", "utf8");
    const blob = encryptBackup(plaintext, passphrase);
    expect(blob.subarray(0, 5).toString("ascii")).toBe("BGBK1");
    expect(blob.includes(plaintext)).toBe(false);
    expect(decryptBackup(blob, passphrase).equals(plaintext)).toBe(true);
  });

  it("rejects a wrong passphrase and a tampered file", () => {
    const blob = encryptBackup(Buffer.from("secret"), passphrase);
    expect(() => decryptBackup(blob, "not the passphrase")).toThrow(/wrong passphrase/);
    const tampered = Buffer.from(blob);
    tampered[tampered.length - 1] ^= 0xff;
    expect(() => decryptBackup(tampered, passphrase)).toThrow(/wrong passphrase|corrupted/);
    expect(() => decryptBackup(Buffer.from("nope"), passphrase)).toThrow(/BGBK1/);
  });

  it("refuses a weak passphrase", () => {
    expect(() => encryptBackup(Buffer.from("x"), "short")).toThrow(/at least 12/);
  });
});
