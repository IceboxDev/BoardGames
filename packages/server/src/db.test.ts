// Boot-time guard: the connection must enforce foreign keys.
//
// A fresh SQLite connection defaults `PRAGMA foreign_keys` to OFF, which is
// what makes this worth asserting — the production guarantee comes from Turso
// turning it on server-side, and nothing in this repo would notice if that
// ever stopped being true.

import { type Client, createClient } from "@libsql/client";
import { afterEach, describe, expect, it } from "vitest";
import { __test__ } from "./db.ts";

const { assertForeignKeysEnforced } = __test__;

describe("assertForeignKeysEnforced", () => {
  let db: Client;

  afterEach(() => {
    db?.close();
  });

  it("passes when the connection enforces foreign keys", async () => {
    db = createClient({ url: ":memory:" });
    await db.execute("PRAGMA foreign_keys = ON");
    await expect(assertForeignKeysEnforced(db)).resolves.toBeUndefined();
  });

  it("refuses to boot when enforcement is off", async () => {
    db = createClient({ url: ":memory:" });
    await db.execute("PRAGMA foreign_keys = OFF");
    await expect(assertForeignKeysEnforced(db)).rejects.toThrow(/PRAGMA foreign_keys is 0/);
  });

  it("explains what would silently break", async () => {
    db = createClient({ url: ":memory:" });
    await db.execute("PRAGMA foreign_keys = OFF");
    await expect(assertForeignKeysEnforced(db)).rejects.toThrow(/orphans/);
  });
});
