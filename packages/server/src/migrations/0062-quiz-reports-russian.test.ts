// Reports survive the rebuild and may now be about the Russian text.

import { type Client, createClient } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrations } from "./registry.ts";

async function apply(db: Client, from: number, to: number) {
  for (const m of migrations) {
    if (m.version >= from && m.version <= to) await db.batch([...m.statements], "write");
  }
}

describe("migration 0062 — quiz reports in Russian", () => {
  let db: Client;
  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await db.execute("PRAGMA foreign_keys = ON");
    await apply(db, 1, 61);
    await db.execute(
      `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ('u1', 'U', 'u@example.com', 1, '2026-01-01', '2026-01-01')`,
    );
  });
  afterEach(() => db.close());

  it("keeps existing reports and accepts language 'ru'", async () => {
    const insert = (id: string, language: string) =>
      db.execute({
        sql: `INSERT INTO quiz_reports (user_id, target_kind, target_id, issue, language, surface, content_version, snapshot_json, created_at, updated_at)
              VALUES ('u1', 'question', ?, 'typo', ?, 'trainer', 'v', '{}', 'x', 'x')`,
        args: [id, language],
      });
    await insert("f00001", "de");
    await expect(insert("f00002", "ru")).rejects.toThrow();
    await apply(db, 62, 62);
    await insert("f00002", "ru");
    const rows = await db.execute("SELECT target_id, language FROM quiz_reports ORDER BY id");
    expect(rows.rows.map((r) => [r.target_id, r.language])).toEqual([
      ["f00001", "de"],
      ["f00002", "ru"],
    ]);
  });
});
