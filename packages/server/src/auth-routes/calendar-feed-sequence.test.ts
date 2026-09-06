// The iCalendar SEQUENCE counter is incremented IN SQL. Concurrent feed
// fetches with differing content must each get a distinct, ascending number
// and the stored value must equal the highest one handed out — a regressed
// SEQUENCE makes RFC 5545 clients ignore every later update for that night.
//
// Real migration chain, in-memory libsql.

import { type Client, createClient } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "../migrations/migrator.ts";

const db = vi.hoisted(() => ({ current: null as Client | null }));
vi.mock("../db.ts", () => ({
  getDb: () => db.current,
  getDbConnectionConfig: () => ({ url: ":memory:", authToken: undefined }),
}));

const { recordEventVersion } = await import("./calendar-feed-public.ts");

const VIEWER = "member-1";
const NIGHT = "2026-09-12";
const QUIET = { info() {}, warn() {} };

describe("calendar feed SEQUENCE versioning", () => {
  let client: Client;

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    await client.execute("PRAGMA foreign_keys = ON");
    await runMigrations(client, { logger: QUIET });
    db.current = client;
  });

  afterEach(() => {
    client.close();
    db.current = null;
  });

  async function stored(): Promise<number | null> {
    const { rows } = await client.execute({
      sql: "SELECT sequence FROM calendar_feed_event_versions WHERE user_id = ? AND date_key = ?",
      args: [VIEWER, NIGHT],
    });
    return rows[0] ? Number(rows[0].sequence) : null;
  }

  it("starts at 0 and reuses the number while the content is unchanged", async () => {
    expect(await recordEventVersion(VIEWER, NIGHT, "d0")).toBe(0);
    expect(await recordEventVersion(VIEWER, NIGHT, "d0")).toBe(0);
    expect(await recordEventVersion(VIEWER, NIGHT, "d1")).toBe(1);
    expect(await recordEventVersion(VIEWER, NIGHT, "d1")).toBe(1);
    expect(await stored()).toBe(1);
  });

  it("hands out distinct ascending numbers to concurrent fetches with different content", async () => {
    const digests = Array.from({ length: 12 }, (_, i) => `digest-${i}`);
    const results = await Promise.all(digests.map((d) => recordEventVersion(VIEWER, NIGHT, d)));

    // Every bump landed exactly once: the numbers are a permutation of 0..11.
    expect([...results].sort((a, b) => a - b)).toEqual(digests.map((_, i) => i));
    // The stored counter is the highest one anyone was told.
    expect(await stored()).toBe(Math.max(...results));
  });

  it("never regresses when concurrent fetches carry the same new content", async () => {
    await recordEventVersion(VIEWER, NIGHT, "d0");
    const results = await Promise.all(
      Array.from({ length: 6 }, () => recordEventVersion(VIEWER, NIGHT, "d1")),
    );
    // One bump for the new digest; the racers that lost read it back rather
    // than inventing their own number.
    expect(new Set(results)).toEqual(new Set([1]));
    expect(await stored()).toBe(1);
  });

  it("keeps subscribers independent", async () => {
    await recordEventVersion(VIEWER, NIGHT, "d0");
    await recordEventVersion(VIEWER, NIGHT, "d1");
    expect(await recordEventVersion("member-2", NIGHT, "d1")).toBe(0);
    expect(await stored()).toBe(1);
  });
});
