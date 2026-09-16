// Two nights on one date. The second is keyed `date_2` and is a full night
// of its own — its own lock, RSVPs, lineup — while everything that reads the
// key AS A DAY (the availability marks a lock snapshots, the merged
// availability map a member sees) goes through the calendar date. Real
// migration chain on an in-memory libsql, the real routes behind a viewer
// stub.

import {
  AvailabilityMapSchema,
  AvailableGamesSchema,
  CalendarLocksSchema,
} from "@boardgames/core/protocol";
import { type Client, createClient } from "@libsql/client";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../auth/types.ts";
import { runMigrations } from "../migrations/migrator.ts";

const db = vi.hoisted(() => ({ current: null as Client | null }));
vi.mock("../db.ts", () => ({
  getDb: () => db.current,
  getDbConnectionConfig: () => ({ url: ":memory:", authToken: undefined }),
}));

const { adminCalendarLocksRoutes, calendarLocksRoutes } = await import("./calendar-locks.ts");
const { calendarRsvpsRoutes } = await import("./calendar-rsvps.ts");
const { userAvailabilityRoutes } = await import("./user-availability.ts");
const { findNextNightForUser } = await import("../lib/next-night.ts");

const ADMIN = "admin-1";
const HOST = "host-1";
const A = "guest-a";
const B = "guest-b";
const DATE = "2999-05-05";
const DATE2 = `${DATE}_2`;
const QUIET = { info() {}, warn() {} };

type Viewer = { id: string; role?: string };

function app(viewer: Viewer) {
  const a = new Hono<AppEnv>();
  a.use("*", async (c, next) => {
    c.set("user", {
      role: "user",
      onlineMode: "both",
      ...viewer,
    } as unknown as AppEnv["Variables"]["user"]);
    await next();
  });
  a.route("/api/calendar", calendarLocksRoutes);
  a.route("/api/calendar", calendarRsvpsRoutes);
  a.route("/api/admin/calendar", adminCalendarLocksRoutes);
  a.route("/api/user", userAvailabilityRoutes);
  return a;
}

const admin = () => app({ id: ADMIN, role: "admin" });
const as = (id: string) => app({ id });

function post(a: Hono<AppEnv>, path: string, body: object, method = "POST") {
  return a.request(path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function locks(a: Hono<AppEnv>) {
  const res = await a.request("/api/calendar/locks");
  expect(res.status).toBe(200);
  return CalendarLocksSchema.parse(await res.json());
}

async function games(a: Hono<AppEnv>, date: string) {
  const res = await a.request(`/api/calendar/games?date=${date}`);
  expect(res.status).toBe(200);
  return AvailableGamesSchema.parse(await res.json());
}

async function availabilityOf(id: string) {
  const res = await as(id).request("/api/user/availability");
  expect(res.status).toBe(200);
  return AvailabilityMapSchema.parse(await res.json());
}

describe("two nights on one date", () => {
  let client: Client;

  async function addUser(id: string, role = "user") {
    await client.execute({
      sql: `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", role, guest)
            VALUES (?, ?, ?, 0, '2020-01-01', '2020-01-01', ?, 0)`,
      args: [id, `Name ${id}`, `${id}@example.com`, role],
    });
  }

  async function mark(id: string, status: "can" | "maybe") {
    await client.execute({
      sql: "INSERT INTO user_availability_days (user_id, date_key, status) VALUES (?, ?, ?)",
      args: [id, DATE, status],
    });
  }

  async function lockOpen(date: string, over: Record<string, unknown> = {}) {
    const res = await post(admin(), "/api/admin/calendar/lock", {
      date,
      hostUserId: HOST,
      hostName: "Name host-1",
      eventTime: "19:30",
      ...over,
    });
    expect(res.status).toBe(200);
    return (await res.json()) as { expectedUserIds: string[] };
  }

  async function lockPrivate(date: string) {
    const res = await post(admin(), "/api/admin/calendar/lock", {
      date,
      hostUserId: HOST,
      hostName: "Name host-1",
      eventTime: "20:00",
      isPrivate: true,
      seatCount: 3,
      inviteeIds: [A],
      pickMode: "host",
    });
    expect(res.status).toBe(200);
  }

  async function rsvpRows(date: string) {
    const { rows } = await client.execute({
      sql: "SELECT user_id, status, auto FROM rsvps WHERE date_key = ? ORDER BY user_id",
      args: [date],
    });
    return rows.map((r) => [r.user_id, r.status, r.auto]);
  }

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    await client.execute("PRAGMA foreign_keys = ON");
    await runMigrations(client, { logger: QUIET });
    db.current = client;
    await addUser(ADMIN, "admin");
    for (const id of [HOST, A, B]) await addUser(id);
    await mark(A, "can");
    await mark(B, "maybe");
  });

  afterEach(() => {
    client.close();
    db.current = null;
  });

  it("locks a second night beside the first and lists both", async () => {
    await lockOpen(DATE);
    await lockPrivate(DATE2);

    const seen = await locks(admin());
    expect(Object.keys(seen).sort()).toEqual([DATE, DATE2]);
    // The open night: A's "can" became an auto-yes, B's "maybe" is tentative.
    expect(seen[DATE]?.attendance).toEqual({ definite: 1, tentative: 1 });
    expect(seen[DATE]?.isPrivate).toBe(false);
    // The private table on the same evening is its own night entirely.
    expect(seen[DATE2]?.isPrivate).toBe(true);
    expect(seen[DATE2]?.seats).toEqual({ total: 3, taken: 1, waitlisted: 0 });
    expect(seen[DATE2]?.expectedUserIds).toEqual([HOST, A]);

    const open = await games(as(A), DATE);
    expect(open.attendees.map((a) => a.userId).sort()).toEqual([A, B]);
    const table = await games(as(HOST), DATE2);
    expect(table.isPrivate).toBe(true);
    expect(table.seatCount).toBe(3);
  });

  it("a second OPEN night snapshots the same day's availability marks", async () => {
    const { expectedUserIds } = await lockOpen(DATE2, { hostUserId: null, hostName: null });
    expect(expectedUserIds.sort()).toEqual([A, B]);
    expect(await rsvpRows(DATE2)).toEqual([[A, "yes", 1]]);
    const seen = await locks(admin());
    expect(seen[DATE2]?.attendance).toEqual({ definite: 1, tentative: 1 });
    expect(seen[DATE]).toBeUndefined();
  });

  it("folds a night into its day in the merged availability map; a yes on either night keeps the day", async () => {
    await lockOpen(DATE);
    await lockOpen(DATE2, { hostUserId: null, hostName: null });
    // A is auto-yes on both. Passing on the FIRST night alone must not erase
    // the day: they are still at the second table that evening.
    const no1 = await post(as(A), "/api/calendar/rsvp", { date: DATE, status: "no" });
    expect(no1.status).toBe(200);
    let map = await availabilityOf(A);
    expect(map).toEqual({ [DATE]: "can" });
    expect(Object.keys(map).some((k) => k.endsWith("_2"))).toBe(false);
    // Passing on both nights takes the day out.
    const no2 = await post(as(A), "/api/calendar/rsvp", { date: DATE2, status: "no" });
    expect(no2.status).toBe(200);
    map = await availabilityOf(A);
    expect(map[DATE]).toBeUndefined();
  });

  it("only two slots exist", async () => {
    const res = await post(admin(), "/api/admin/calendar/lock", { date: `${DATE}_3` });
    expect(res.status).toBe(400);
    const rsvp = await post(as(A), "/api/calendar/rsvp", { date: `${DATE}_1`, status: "yes" });
    expect(rsvp.status).toBe(400);
  });

  it("the date's first night is the next night; unlocking it hands over to the second", async () => {
    await lockOpen(DATE);
    await lockOpen(DATE2, { hostUserId: null, hostName: null });
    const viewer = { viewerId: A, viewerIsAdmin: false };
    expect((await findNextNightForUser(client, A, viewer))?.dateKey).toBe(DATE);

    const res = await post(admin(), "/api/admin/calendar/lock", { date: DATE }, "DELETE");
    expect(res.status).toBe(200);
    const seen = await locks(admin());
    expect(Object.keys(seen)).toEqual([DATE2]);
    expect((await findNextNightForUser(client, A, viewer))?.dateKey).toBe(DATE2);
  });
});
