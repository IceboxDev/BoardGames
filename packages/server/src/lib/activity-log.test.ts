// The write side of the activity trail: event-time stamps, the restart-safe
// visit tracker, and settings diffs. Real migration chain, in-memory libsql.

import { type Client, createClient } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "../migrations/migrator.ts";

const db = vi.hoisted(() => ({ current: null as Client | null }));
vi.mock("../db.ts", () => ({
  getDb: () => db.current,
  getDbConnectionConfig: () => ({ url: ":memory:", authToken: undefined }),
}));

const {
  logActivity,
  markSeen,
  nextActivityStamp,
  noteVisit,
  resetVisitTracking,
  settingsChanges,
  visitProbeSettled,
} = await import("./activity-log.ts");

const QUIET = { info() {}, warn() {} };
const U = "member-1";
const MIN = 60 * 1000;

describe("nextActivityStamp", () => {
  it("is strictly increasing, even inside one millisecond or when the clock steps back", () => {
    const t = Date.now() + 10 * MIN;
    const a = nextActivityStamp(t);
    const b = nextActivityStamp(t);
    const c = nextActivityStamp(t - 5000);
    expect(a).toBe(t);
    expect(b).toBe(t + 1);
    expect(c).toBe(t + 2);
    expect(nextActivityStamp(t + 1000)).toBe(t + 1000);
  });
});

describe("activity rows", () => {
  let client: Client;

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    await runMigrations(client, { logger: QUIET });
    db.current = client;
    await client.execute({
      sql: `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
            VALUES (?, 'M', 'm@example.com', 0, '2020-01-01', '2020-01-01')`,
      args: [U],
    });
    resetVisitTracking();
    // The stamp counter is process-wide and only moves forward (the first test
    // pushes it past the real clock), so the frozen clock starts safely after it:
    // a fixed date would fall behind the counter a few days after it was written.
    const start = Date.now() + 60 * MIN;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(start);
  });

  afterEach(() => {
    vi.useRealTimers();
    client.close();
    db.current = null;
  });

  async function types(): Promise<string[]> {
    const { rows } = await client.execute({
      sql: "SELECT type FROM activity_log WHERE user_id = ? ORDER BY sort_ms, id",
      args: [U],
    });
    return rows.map((r) => String(r.type));
  }

  /** Wait for fire-and-forget inserts to land. */
  async function settle(n: number): Promise<void> {
    await vi.waitFor(async () => {
      const { rows } = await client.execute("SELECT COUNT(*) AS n FROM activity_log");
      expect(Number(rows[0]?.n)).toBe(n);
    });
  }

  it("stamps each row with the time it was handled, so the trail keeps that order", async () => {
    logActivity(U, "greeting-response", { kind: "spotlight", action: "cta" });
    logActivity(U, "page-view", { page: "profile-skill", detail: "x" });
    await settle(2);
    const { rows } = await client.execute("SELECT type, logged_at_ms FROM activity_log");
    for (const r of rows) expect(Number(r.logged_at_ms)).toBeGreaterThan(0);
    expect(await types()).toEqual(["greeting-response", "page-view"]);
  });

  it("logs a visit for a member first seen by this process with no recent activity", async () => {
    noteVisit(U);
    await visitProbeSettled();
    await settle(1);
    expect(await types()).toEqual(["visit"]);
  });

  it("does not log a visit after a restart when the member was active minutes ago", async () => {
    await client.execute({
      sql: "INSERT INTO activity_log (user_id, type, logged_at_ms) VALUES (?, 'page-view', ?)",
      args: [U, Date.now() - 5 * MIN],
    });
    noteVisit(U); // this process has never seen U — a cold start
    await visitProbeSettled();
    expect(await types()).toEqual(["page-view"]);
  });

  it("sorts a cold-start visit before what the same request logs during the probe", async () => {
    noteVisit(U);
    logActivity(U, "page-view", { page: "home" });
    await visitProbeSettled();
    await settle(2);
    expect(await types()).toEqual(["visit", "page-view"]);
  });

  it("logs one visit per 30 minutes of silence once the member is known", async () => {
    markSeen(U); // signed in: no visit row
    noteVisit(U);
    vi.setSystemTime(Date.now() + 29 * MIN);
    noteVisit(U);
    vi.setSystemTime(Date.now() + 31 * MIN);
    noteVisit(U);
    await settle(1);
    expect(await types()).toEqual(["visit"]);
  });
});

describe("settingsChanges", () => {
  it("records only the fields that changed, from and to", () => {
    expect(
      settingsChanges(
        { language: "en", newPerDay: 10, byCategory: { a: 1, b: 2 } },
        { language: "de", newPerDay: 10, byCategory: { b: 2, a: 1 } },
      ),
    ).toEqual({ language: { from: "en", to: "de" } });
  });

  it("treats a field added or removed as a change to or from null", () => {
    expect(settingsChanges({ focus: "eu" }, {})).toEqual({ focus: { from: "eu", to: null } });
    expect(settingsChanges({}, { focus: null })).toEqual({});
  });

  it("is empty for a no-op save", () => {
    expect(settingsChanges({ a: [1, 2] }, { a: [1, 2] })).toEqual({});
  });
});
