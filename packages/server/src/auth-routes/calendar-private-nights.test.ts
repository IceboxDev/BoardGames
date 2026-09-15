// Private nights, end to end at the route layer: who sees what, who may
// answer, how seats fill and free, and what the host can change. Real
// migration chain on an in-memory libsql, the real routes behind a viewer
// stub (admin routes are mounted without the requireAdmin umbrella, so only
// admin viewers call them here).

import { AvailableGamesSchema, CalendarLocksSchema } from "@boardgames/core/protocol";
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
const { calendarExitRoutes } = await import("./calendar-exit.ts");
const { profileRoutes } = await import("./profile.ts");
const { profileInsightsRoutes } = await import("./profile-insights.ts");
const { listLockedDatesForViewer } = await import("../lib/available-games.ts");
const { findNextNightDateKeysForUsers, findNextNightForUser } = await import(
  "../lib/next-night.ts"
);

const ADMIN = "admin-1";
const HOST = "host-1";
const A = "guest-a";
const B = "guest-b";
const C = "guest-c";
const OUT = "outsider";
const DATE = "2999-05-05";
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
  a.route("/api/calendar", calendarExitRoutes);
  a.route("/api/admin/calendar", adminCalendarLocksRoutes);
  a.route("/api/profiles", profileRoutes);
  a.route("/api/profiles", profileInsightsRoutes);
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

async function games(a: Hono<AppEnv>) {
  const res = await a.request(`/api/calendar/games?date=${DATE}`);
  return {
    status: res.status,
    body: res.status === 200 ? AvailableGamesSchema.parse(await res.json()) : null,
  };
}

async function code(res: Response): Promise<string | undefined> {
  const body = (await res.json()) as { code?: string };
  return body.code;
}

describe("private nights", () => {
  let client: Client;

  async function addUser(id: string, opts: { role?: string; guest?: boolean } = {}) {
    await client.execute({
      sql: `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", role, guest)
            VALUES (?, ?, ?, 0, '2020-01-01', '2020-01-01', ?, ?)`,
      args: [id, `Name ${id}`, `${id}@example.com`, opts.role ?? "user", opts.guest ? 1 : 0],
    });
  }

  async function inventory(userId: string, slugs: string[]) {
    await client.execute({
      sql: "INSERT INTO user_inventory (user_id, game_slugs_json) VALUES (?, ?)",
      args: [userId, JSON.stringify(slugs)],
    });
  }

  async function lockPrivate(over: Record<string, unknown> = {}) {
    const res = await post(admin(), "/api/admin/calendar/lock", {
      date: DATE,
      hostUserId: HOST,
      hostName: "Name host-1",
      eventTime: "19:30",
      address: "1 Table St",
      isPrivate: true,
      seatCount: 3,
      inviteeIds: [A, B, C],
      pickMode: "host",
      title: "TI4 marathon",
      ...over,
    });
    expect(res.status).toBe(200);
    return res;
  }

  async function rsvp(id: string, status: "yes" | "no", rsvpedAt?: string) {
    if (rsvpedAt) {
      await client.execute({
        sql: `INSERT INTO rsvps (date_key, user_id, status, rsvped_at, auto) VALUES (?, ?, ?, ?, 0)
              ON CONFLICT(date_key, user_id) DO UPDATE SET status = excluded.status, rsvped_at = excluded.rsvped_at`,
        args: [DATE, id, status, rsvpedAt],
      });
      return;
    }
    const res = await post(as(id), "/api/calendar/rsvp", { date: DATE, status });
    expect(res.status).toBe(200);
  }

  async function lockRow() {
    const { rows } = await client.execute({
      sql: "SELECT expected_user_ids_json, private, seat_count, pick_mode, title, picks_locked_at, unlocked_at FROM locked_dates WHERE date_key = ?",
      args: [DATE],
    });
    const r = rows[0] as unknown as Record<string, unknown>;
    return {
      ...r,
      expected: JSON.parse(String(r.expected_user_ids_json)) as string[],
    } as Record<string, unknown> & { expected: string[] };
  }

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    await client.execute("PRAGMA foreign_keys = ON");
    await runMigrations(client, { logger: QUIET });
    db.current = client;
    await addUser(ADMIN, { role: "admin" });
    for (const id of [HOST, A, B, C, OUT]) await addUser(id);
    await inventory(HOST, ["catan", "azul"]);
    await inventory(A, ["azul", "wingspan"]);
    await inventory(OUT, ["gloomhaven"]);
  });

  afterEach(() => {
    client.close();
    db.current = null;
  });

  // ── Locking ────────────────────────────────────────────────────────────

  it("locks a private night: host + invitees, host seated, availability ignored", async () => {
    // An outsider who marked "can" would become an attendee on an open night.
    await client.execute({
      sql: "INSERT INTO user_availability_days (user_id, date_key, status) VALUES (?, ?, 'can')",
      args: [OUT, DATE],
    });
    await lockPrivate();
    const row = await lockRow();
    expect(row.expected).toEqual([HOST, A, B, C]);
    expect(row.private).toBe(1);
    expect(row.seat_count).toBe(3);
    expect(row.pick_mode).toBe("host");
    expect(row.title).toBe("TI4 marathon");
    const { rows } = await client.execute({
      sql: "SELECT user_id, status, auto FROM rsvps WHERE date_key = ?",
      args: [DATE],
    });
    expect(rows.map((r) => [r.user_id, r.status, r.auto])).toEqual([[HOST, "yes", 1]]);

    const seen = await locks(admin());
    expect(seen[DATE]?.seats).toEqual({ total: 3, taken: 1, waitlisted: 0 });
    expect(seen[DATE]?.seatedUserIds).toEqual([HOST]);
    expect(seen[DATE]?.attendance).toEqual({ definite: 1, tentative: 0 });
    const { rows: log } = await client.execute(
      "SELECT meta_json FROM activity_log WHERE type = 'night-locked'",
    );
    expect(JSON.parse(String(log[0]?.meta_json))).toMatchObject({ private: true, seatCount: 3 });
  });

  it("refuses a private lock without a host or a seat count", async () => {
    const res = await post(admin(), "/api/admin/calendar/lock", {
      date: DATE,
      isPrivate: true,
      seatCount: 3,
    });
    expect(res.status).toBe(400);
  });

  it("converting an open night to private drops outsiders' stale rows", async () => {
    await post(admin(), "/api/admin/calendar/lock", { date: DATE });
    await rsvp(OUT, "yes", "2020-01-01 10:00:00");
    await client.execute({
      sql: "INSERT INTO game_requests (date_key, user_id, game_slug, reaction) VALUES (?, ?, 'catan', 'hype')",
      args: [DATE, OUT],
    });
    await lockPrivate();
    const { rows } = await client.execute({
      sql: "SELECT user_id FROM rsvps WHERE date_key = ? UNION ALL SELECT user_id FROM game_requests WHERE date_key = ?",
      args: [DATE, DATE],
    });
    expect(rows.map((r) => r.user_id)).toEqual([HOST]);
    expect((await locks(as(OUT)))[DATE]?.redacted).toBe(true);
  });

  it("re-locking without inviteeIds keeps the guest list; with them replaces it", async () => {
    await lockPrivate();
    await lockPrivate({ inviteeIds: undefined, seatCount: 4 });
    expect((await lockRow()).expected).toEqual([HOST, A, B, C]);
    await rsvp(C, "yes", "2020-01-01 10:00:00");
    await lockPrivate({ inviteeIds: [A] });
    expect((await lockRow()).expected).toEqual([HOST, A]);
    const { rows } = await client.execute({
      sql: "SELECT user_id FROM rsvps WHERE date_key = ? AND user_id = ?",
      args: [DATE, C],
    });
    expect(rows).toHaveLength(0);
  });

  // ── Reading ────────────────────────────────────────────────────────────

  it("redacts the night for an outsider and 403s the games payload", async () => {
    await lockPrivate();
    await rsvp(A, "yes", "2020-01-01 10:00:00");
    const lock = (await locks(as(OUT)))[DATE];
    expect(lock).toMatchObject({
      redacted: true,
      isPrivate: true,
      rsvps: {},
      expectedUserIds: [],
      seatedUserIds: [],
      eventTime: null,
      address: null,
      title: null,
      topGameSlug: null,
      seats: { total: 3, taken: 2, waitlisted: 0 },
      attendance: { definite: 2, tentative: 0 },
    });
    expect(lock?.host).toEqual({ userId: HOST, name: "Name host-1" });

    const res = await games(as(OUT));
    expect(res.status).toBe(403);
    const exit = await as(OUT).request(`/api/calendar/exit?date=${DATE}`);
    expect(exit.status).toBe(403);
  });

  it("shows an invitee the guest list but keeps others' declines for the host and admin", async () => {
    await lockPrivate();
    await rsvp(A, "yes", "2020-01-01 10:00:00");
    await rsvp(B, "no", "2020-01-01 10:00:01");
    const forInvitee = (await locks(as(C)))[DATE];
    expect(forInvitee?.redacted).toBe(false);
    expect(forInvitee?.title).toBe("TI4 marathon");
    expect(forInvitee?.expectedUserIds).toEqual([HOST, A, B, C]);
    expect(forInvitee?.rsvps).toEqual({ [HOST]: "yes", [A]: "yes" });
    expect((await locks(as(B)))[DATE]?.rsvps).toEqual({ [HOST]: "yes", [A]: "yes", [B]: "no" });
    expect((await locks(as(HOST)))[DATE]?.rsvps).toEqual({ [HOST]: "yes", [A]: "yes", [B]: "no" });
    expect((await locks(admin()))[DATE]?.rsvps).toEqual({ [HOST]: "yes", [A]: "yes", [B]: "no" });
  });

  it("games payload: seat states, the seat-count window, and who may react", async () => {
    await lockPrivate();
    await rsvp(A, "yes", "2020-01-01 10:00:00");
    await rsvp(B, "no", "2020-01-01 10:00:01");
    const invitee = await games(as(C));
    expect(invitee.status).toBe(200);
    expect(invitee.body).toMatchObject({
      isPrivate: true,
      pickMode: "host",
      seatCount: 3,
      playerWindow: { lo: 3, hi: 3 },
      viewerCanReact: false,
      definiteCount: 2,
      tentativeCount: 0,
      participantIds: [HOST, A],
      ownedSlugs: ["azul", "catan", "wingspan"],
    });
    const seatOf = Object.fromEntries(invitee.body?.attendees.map((a) => [a.userId, a.seat]) ?? []);
    // The invitee doesn't see B's decline; the host does.
    expect(seatOf).toEqual({ [HOST]: "host", [A]: "seated", [C]: "invited" });
    const host = await games(as(HOST));
    expect(host.body?.viewerCanReact).toBe(true);
    expect(host.body?.attendees.map((a) => [a.userId, a.seat])).toEqual([
      [HOST, "host"],
      [A, "seated"],
      [C, "invited"],
      [B, "declined"],
    ]);
  });

  // ── Seats ──────────────────────────────────────────────────────────────

  it("fills seats first come first served and promotes the waitlist when someone drops", async () => {
    await lockPrivate();
    await rsvp(B, "yes", "2020-01-01 10:00:00.200");
    await rsvp(A, "yes", "2020-01-01 10:00:00.100");
    await rsvp(C, "yes", "2020-01-01 10:00:01");
    let lock = (await locks(as(A)))[DATE];
    expect(lock?.seatedUserIds).toEqual([HOST, A, B]);
    expect(lock?.waitlistUserIds).toEqual([C]);
    expect(lock?.seats).toEqual({ total: 3, taken: 3, waitlisted: 1 });

    await rsvp(A, "no");
    lock = (await locks(as(A)))[DATE];
    expect(lock?.seatedUserIds).toEqual([HOST, B, C]);
    expect(lock?.waitlistUserIds).toEqual([]);

    // Coming back re-enters at the back of the line.
    await rsvp(A, "yes");
    lock = (await locks(as(A)))[DATE];
    expect(lock?.waitlistUserIds).toEqual([A]);
  });

  it("a repeated yes never moves you back; only a changed answer re-stamps", async () => {
    await lockPrivate();
    await rsvp(A, "yes", "2020-01-01 10:00:00");
    await rsvp(B, "yes", "2020-01-01 10:00:01");
    await rsvp(A, "yes"); // the modal re-sending on open
    const { rows } = await client.execute({
      sql: "SELECT rsvped_at FROM rsvps WHERE date_key = ? AND user_id = ?",
      args: [DATE, A],
    });
    expect(rows[0]?.rsvped_at).toBe("2020-01-01 10:00:00");
    expect((await locks(as(A)))[DATE]?.seatedUserIds).toEqual([HOST, A, B]);
  });

  it("gates answers: outsiders, the host leaving, kicking the host", async () => {
    await lockPrivate();
    const out = await post(as(OUT), "/api/calendar/rsvp", { date: DATE, status: "yes" });
    expect(out.status).toBe(403);
    expect(await code(out)).toBe("NOT_INVITED");
    const hostNo = await post(as(HOST), "/api/calendar/rsvp", { date: DATE, status: "no" });
    expect(hostNo.status).toBe(400);
    expect(await code(hostNo)).toBe("HOST_CANNOT_LEAVE");
    const hostClear = await post(as(HOST), "/api/calendar/rsvp", { date: DATE }, "DELETE");
    expect(hostClear.status).toBe(400);
    const kickHost = await post(admin(), "/api/calendar/rsvp/kick", { date: DATE, userId: HOST });
    expect(kickHost.status).toBe(400);
    expect(await code(kickHost)).toBe("HOST_NOT_REMOVABLE");
    // An invitee's "auto" flag never claims a seat silently.
    const auto = await post(as(A), "/api/calendar/rsvp", { date: DATE, status: "yes", auto: true });
    expect(auto.status).toBe(200);
    const { rows } = await client.execute({
      sql: "SELECT auto FROM rsvps WHERE date_key = ? AND user_id = ?",
      args: [DATE, A],
    });
    expect(rows[0]?.auto).toBe(0);
  });

  // ── Lineup ─────────────────────────────────────────────────────────────

  it("host-pick mode: only the host picks, in pick order; group mode: the seated vote", async () => {
    await lockPrivate();
    await rsvp(A, "yes", "2020-01-01 10:00:00");
    const react = (id: string, slug: string, reaction = "hype") =>
      post(as(id), "/api/calendar/games/reaction", { date: DATE, slug, reaction, on: true });
    expect((await react(A, "azul")).status).toBe(403);
    expect(await code(await react(A, "wingspan"))).toBe("CANNOT_REACT");
    expect((await react(HOST, "azul")).status).toBe(200);
    await client.execute({
      sql: "UPDATE game_requests SET created_at = '2999-01-01 09:00:00' WHERE user_id = ? AND game_slug = 'azul'",
      args: [HOST],
    });
    expect((await react(HOST, "catan")).status).toBe(200);
    await client.execute({
      sql: "UPDATE game_requests SET created_at = '2999-01-01 09:00:01' WHERE user_id = ? AND game_slug = 'catan'",
      args: [HOST],
    });
    // Alphabetical would put azul first either way; flip the stamps to prove
    // it is pick order that wins.
    await client.execute({
      sql: "UPDATE game_requests SET created_at = CASE game_slug WHEN 'azul' THEN '2999-01-01 09:00:02' ELSE '2999-01-01 09:00:00' END WHERE user_id = ?",
      args: [HOST],
    });
    expect((await games(as(HOST))).body?.topSlugs).toEqual(["catan", "azul"]);
    expect((await locks(as(HOST)))[DATE]?.topGameSlug).toBe("catan");

    // Switch to group voting: A (seated) may vote, C (unanswered) may not.
    const flip = await post(as(HOST), "/api/calendar/private-night", {
      date: DATE,
      pickMode: "group",
    });
    expect(flip.status).toBe(200);
    expect((await react(A, "wingspan")).status).toBe(200);
    expect((await react(C, "wingspan")).status).toBe(403);
    const body = (await games(as(A))).body;
    expect(body?.pickMode).toBe("group");
    expect(body?.viewerCanReact).toBe(true);
    // Hype count now ranks: wingspan and catan/azul each have one hype.
    expect(body?.topSlugs).toHaveLength(3);
  });

  it("has no second lock: a private night is sealed from lock-in and the padlock is refused", async () => {
    await lockPrivate();
    const res = await post(as(HOST), "/api/calendar/lock-picks", { date: DATE, on: true });
    expect(res.status).toBe(400);
    expect(await code(res)).toBe("NOT_APPLICABLE");
    expect((await lockRow()).picks_locked_at).toBeNull();
    // …yet every reader sees it sealed — from the moment it was locked.
    const lock = (await locks(as(A)))[DATE];
    expect(lock?.picksLockedAt).not.toBeNull();
    expect((await games(as(A))).body?.picksLockedAt).toBe(lock?.picksLockedAt);
    expect((await locks(as(OUT)))[DATE]?.picksLockedAt).not.toBeNull();
  });

  // ── Managing ───────────────────────────────────────────────────────────

  it("host manages seats, title and the guest list; removal drops rows, re-invite greets again", async () => {
    await lockPrivate();
    await rsvp(A, "yes", "2020-01-01 10:00:00");
    await rsvp(B, "yes", "2020-01-01 10:00:01");
    const manage = (body: object, who = HOST) =>
      post(as(who), "/api/calendar/private-night", { date: DATE, ...body });

    expect((await manage({}, A)).status).toBe(403);
    const tooFew = await manage({ seatCount: 2 });
    expect(tooFew.status).toBe(400);
    expect(await code(tooFew)).toBe("SEATS_BELOW_SEATED");

    expect((await manage({ seatCount: 5, title: "Marathon!", addInviteeIds: [OUT] })).status).toBe(
      200,
    );
    let row = await lockRow();
    expect(row.seat_count).toBe(5);
    expect(row.title).toBe("Marathon!");
    expect(row.expected).toEqual([HOST, A, B, C, OUT]);

    expect((await manage({ removeInviteeIds: [B] })).status).toBe(200);
    row = await lockRow();
    expect(row.expected).toEqual([HOST, A, C, OUT]);
    const { rows } = await client.execute({
      sql: "SELECT user_id FROM rsvps WHERE date_key = ? ORDER BY user_id",
      args: [DATE],
    });
    expect(rows.map((r) => r.user_id)).toEqual([A, HOST]);

    await client.execute({
      sql: "INSERT INTO night_invite_seen (date_key, user_id) VALUES (?, ?)",
      args: [DATE, B],
    });
    expect((await manage({ addInviteeIds: [B] })).status).toBe(200);
    const { rows: seen } = await client.execute({
      sql: "SELECT 1 FROM night_invite_seen WHERE date_key = ? AND user_id = ?",
      args: [DATE, B],
    });
    expect(seen).toHaveLength(0);

    const removeHost = await manage({ removeInviteeIds: [HOST] });
    expect(await code(removeHost)).toBe("HOST_NOT_REMOVABLE");
    const unknown = await manage({ addInviteeIds: ["nobody"] });
    expect(await code(unknown)).toBe("UNKNOWN_USER");
    const { rows: log } = await client.execute(
      "SELECT type FROM activity_log WHERE type LIKE 'night-%' ORDER BY id",
    );
    expect(log.map((r) => r.type)).toEqual([
      "night-locked",
      "night-invited",
      "night-seats",
      "night-uninvited",
      "night-invited",
    ]);
  });

  it("refuses to manage an open night", async () => {
    await post(admin(), "/api/admin/calendar/lock", {
      date: DATE,
      hostUserId: HOST,
      hostName: "H",
    });
    const res = await post(as(HOST), "/api/calendar/private-night", { date: DATE, seatCount: 4 });
    expect(res.status).toBe(400);
    expect(await code(res)).toBe("NOT_PRIVATE");
  });

  it("an admin-added guest joins the guest list", async () => {
    await addUser("plus-one", { guest: true });
    await lockPrivate();
    const res = await post(admin(), "/api/admin/calendar/night-guest", {
      date: DATE,
      guestUserId: "plus-one",
      on: true,
    });
    expect(res.status).toBe(200);
    expect((await lockRow()).expected).toEqual([HOST, A, B, C, "plus-one"]);
    expect((await locks(as(A)))[DATE]?.seatedUserIds).toEqual([HOST, "plus-one"]);
  });

  it("unlocking writes a private tombstone; reviving keeps the guest list", async () => {
    await lockPrivate();
    await rsvp(A, "yes", "2020-01-01 10:00:00");
    expect((await post(admin(), "/api/admin/calendar/lock", { date: DATE }, "DELETE")).status).toBe(
      200,
    );
    const { rows } = await client.execute({
      sql: "SELECT private, title, expected_user_ids_json FROM calendar_unlocked_tombstones WHERE date_key = ?",
      args: [DATE],
    });
    expect(rows[0]).toMatchObject({ private: 1, title: "TI4 marathon" });
    expect(await locks(as(A))).toEqual({});

    await lockPrivate({ inviteeIds: undefined });
    const lock = (await locks(as(A)))[DATE];
    expect(lock?.expectedUserIds).toEqual([HOST, A, B, C]);
    expect(lock?.seatedUserIds).toEqual([HOST, A]);
  });

  // ── Other readers ──────────────────────────────────────────────────────

  it("the feed lists a private night for invitees only, exact-id matched", async () => {
    await addUser("guest-ab"); // a prefix collision for instr()-style matching
    await lockPrivate({ inviteeIds: [A] });
    // A stale outsider "yes" would have qualified an open night.
    await client.execute({
      sql: "INSERT INTO rsvps (date_key, user_id, status, auto) VALUES (?, ?, 'yes', 0)",
      args: [DATE, OUT],
    });
    const list = (viewerId: string) =>
      listLockedDatesForViewer({
        db: client,
        viewerId,
        fromInclusive: "2999-01-01",
        toExclusive: "2999-12-31",
        tombstoneCutoff: "2000-01-01",
      });
    expect(await list(A)).toEqual([{ dateKey: DATE, source: "locked" }]);
    expect(await list(HOST)).toEqual([{ dateKey: DATE, source: "locked" }]);
    expect(await list(OUT)).toEqual([]);
    expect(await list("guest-ab")).toEqual([]);
    expect(await list("guest-")).toEqual([]);
  });

  it("next night: seat-list based, and invisible to a viewer who is not on it", async () => {
    await lockPrivate({ seatCount: 2 });
    await rsvp(A, "yes", "2020-01-01 10:00:00");
    await rsvp(B, "yes", "2020-01-01 10:00:01");
    // An outsider's "can" mark means nothing here.
    await client.execute({
      sql: "INSERT INTO user_availability_days (user_id, date_key, status) VALUES (?, ?, 'can')",
      args: [OUT, DATE],
    });
    const self = (id: string) => ({ viewerId: id, viewerIsAdmin: false });
    expect(await findNextNightForUser(client, A, self(A), "2999-01-01")).toEqual({
      dateKey: DATE,
      status: "definite",
    });
    expect(await findNextNightForUser(client, B, self(B), "2999-01-01")).toEqual({
      dateKey: DATE,
      status: "tentative",
    });
    expect(await findNextNightForUser(client, C, self(C), "2999-01-01")).toEqual({
      dateKey: DATE,
      status: "tentative",
    });
    expect(await findNextNightForUser(client, OUT, self(OUT), "2999-01-01")).toBeNull();
    // A's profile viewed by an outsider: no next night at all.
    expect(await findNextNightForUser(client, A, self(OUT), "2999-01-01")).toBeNull();
    expect(
      await findNextNightForUser(client, A, { viewerId: OUT, viewerIsAdmin: true }, "2999-01-01"),
    ).toEqual({ dateKey: DATE, status: "definite" });
    const directory = await findNextNightDateKeysForUsers(
      client,
      [A, HOST],
      self(OUT),
      "2999-01-01",
    );
    expect(directory.size).toBe(0);
    const asInvitee = await findNextNightDateKeysForUsers(client, [A, HOST], self(C), "2999-01-01");
    expect([...asInvitee.entries()]).toEqual([
      [A, DATE],
      [HOST, DATE],
    ]);
  });

  it("profile nights page: a past private night is hidden from outsiders and absent for the uninvited", async () => {
    const past = "2000-05-05";
    await client.execute({
      sql: `INSERT INTO locked_dates (date_key, locked_by, expected_user_ids_json, host_user_id, host_name, address, private, seat_count)
            VALUES (?, ?, ?, ?, 'Name host-1', '1 Table St', 1, 3)`,
      args: [past, ADMIN, JSON.stringify([HOST, A]), HOST],
    });
    await client.execute({
      sql: "INSERT INTO rsvps (date_key, user_id, status, auto) VALUES (?, ?, 'yes', 0)",
      args: [past, A],
    });
    const nights = async (subject: string, viewer: Hono<AppEnv>) => {
      const res = await viewer.request(`/api/profiles/${subject}/nights`);
      expect(res.status).toBe(200);
      return (await res.json()) as {
        items: { dateKey: string; isPrivate: boolean; host: unknown; address: unknown }[];
      };
    };
    const forHost = await nights(A, as(HOST));
    expect(forHost.items[0]).toMatchObject({
      dateKey: past,
      isPrivate: true,
      address: "1 Table St",
    });
    const forOutsider = await nights(A, as(OUT));
    expect(forOutsider.items[0]).toMatchObject({
      dateKey: past,
      isPrivate: true,
      host: null,
      address: null,
    });
    expect((await nights(OUT, as(OUT))).items).toEqual([]);
  });
});
