// The admin's outstanding overview: what each member owes on the upcoming
// nights (RSVP, invite, picks, EXIT box, host details), the purchase poll,
// the collection, and the admins' own notes (create / edit / tick / delete).

import {
  AdminMemberNoteResponseSchema,
  AdminMemberNotesResponseSchema,
  AdminOutstandingResponseSchema,
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

const { adminOutstandingRoutes, adminMemberNoteRoutes } = await import("./admin-outstanding.ts");

const QUIET = { info() {}, warn() {} };
const ADMIN = "admin";
const OPEN = "2999-01-08";
const PRIVATE = "2999-01-09";
const EXIT = "2999-01-10";
const PAST = "2000-01-01";

function app() {
  const a = new Hono<AppEnv>();
  a.use("*", async (c, next) => {
    c.set("user", { id: ADMIN, role: "admin" } as unknown as AppEnv["Variables"]["user"]);
    await next();
  });
  a.route("/api/admin", adminOutstandingRoutes);
  a.route("/api/admin/users", adminMemberNoteRoutes);
  return a;
}
const send = (method: string, path: string, body?: object) =>
  app().request(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

describe("admin outstanding overview", () => {
  let client: Client;
  const exec = (sql: string, args: (string | number | null)[] = []) =>
    client.execute({ sql, args });

  async function addUser(id: string, role = "user", onlineMode = "both") {
    await exec(
      `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", role, guest, "onlineMode")
       VALUES (?, ?, ?, 0, '2020-01-01', '2020-01-01', ?, 0, ?)`,
      [id, `Name ${id}`, `${id}@example.com`, role, onlineMode],
    );
    // Everyone has declared a collection unless a test removes it.
    await exec("INSERT INTO user_inventory (user_id, game_slugs_json) VALUES (?, '[\"azul\"]')", [
      id,
    ]);
  }

  async function lockNight(
    dateKey: string,
    over: Partial<{
      expected: string[];
      host: string;
      eventTime: string | null;
      address: string | null;
      isPrivate: boolean;
      seats: number;
      title: string;
      fixed: string;
    }> = {},
  ) {
    await exec(
      `INSERT INTO locked_dates (date_key, locked_by, expected_user_ids_json, host_user_id, host_name,
         event_time, address, private, seat_count, title, fixed_game_slug)
       VALUES (?, ?, ?, ?, 'Host', ?, ?, ?, ?, ?, ?)`,
      [
        dateKey,
        ADMIN,
        JSON.stringify(over.expected ?? []),
        over.host ?? "host",
        over.eventTime === undefined ? "18:00" : over.eventTime,
        over.address === undefined ? "Main St 1" : over.address,
        over.isPrivate ? 1 : 0,
        over.seats ?? null,
        over.title ?? null,
        over.fixed ?? null,
      ],
    );
  }

  const can = (userId: string, dateKey: string, status = "can") =>
    exec("INSERT INTO user_availability_days (user_id, date_key, status) VALUES (?, ?, ?)", [
      userId,
      dateKey,
      status,
    ]);
  const rsvp = (userId: string, dateKey: string, status: "yes" | "no", auto: 0 | 1) =>
    exec("INSERT INTO rsvps (date_key, user_id, status, auto) VALUES (?, ?, ?, ?)", [
      dateKey,
      userId,
      status,
      auto,
    ]);

  async function overview() {
    const res = await send("GET", "/api/admin/outstanding");
    expect(res.status).toBe(200);
    return AdminOutstandingResponseSchema.parse(await res.json()).members;
  }
  const kindsOf = async (id: string) =>
    ((await overview())[id]?.items ?? []).map((i) =>
      "dateKey" in i ? `${i.kind}@${i.dateKey}` : i.kind,
    );

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    await client.execute("PRAGMA foreign_keys = ON");
    await runMigrations(client, { logger: QUIET });
    db.current = client;
    await addUser(ADMIN, "admin");
    for (const id of ["host", "auto", "manual", "teach", "maybe", "invitee"]) await addUser(id);
  });

  afterEach(() => {
    client.close();
    db.current = null;
  });

  it("lists RSVPs and picks owed on a still-voting open night", async () => {
    await lockNight(OPEN);
    for (const id of ["host", "auto", "manual", "teach"]) await can(id, OPEN);
    await can("maybe", OPEN, "maybe");
    await rsvp("auto", OPEN, "yes", 1);
    await rsvp("manual", OPEN, "yes", 0);
    await rsvp("teach", OPEN, "yes", 0);
    await exec(
      "INSERT INTO game_requests (date_key, user_id, game_slug, reaction) VALUES (?, 'manual', 'azul', 'hype'), (?, 'teach', 'azul', 'teach'), (?, 'host', 'azul', 'hype')",
      [OPEN, OPEN, OPEN],
    );

    expect(await kindsOf("auto")).toEqual([`rsvp@${OPEN}`, `vote@${OPEN}`]);
    expect(await kindsOf("manual")).toEqual([]);
    expect(await kindsOf("teach")).toEqual([`vote@${OPEN}`]);
    const maybe = (await overview()).maybe?.items[0];
    expect(maybe).toMatchObject({ kind: "rsvp", reason: "maybe" });
    expect(await kindsOf("host")).toEqual([]);
  });

  it("ignores past nights and sealed nights' picks", async () => {
    await lockNight(PAST);
    await can("auto", PAST);
    await lockNight(OPEN);
    await exec("UPDATE locked_dates SET picks_locked_at = datetime('now') WHERE date_key = ?", [
      OPEN,
    ]);
    await can("auto", OPEN);
    await rsvp("auto", OPEN, "yes", 0);
    expect(await kindsOf("auto")).toEqual([]);
  });

  it("asks a private night's silent invitee, and the host for missing details", async () => {
    await lockNight(PRIVATE, {
      isPrivate: true,
      expected: ["invitee", "manual"],
      seats: 4,
      title: "TI4",
      address: null,
    });
    await rsvp("manual", PRIVATE, "yes", 0);
    const members = await overview();
    expect(members.invitee?.items).toEqual([{ kind: "invite", dateKey: PRIVATE, title: "TI4" }]);
    expect(members.manual?.items).toEqual([]);
    expect(members.host?.items).toEqual([
      { kind: "host-details", dateKey: PRIVATE, title: "TI4", missing: ["address"] },
    ]);
  });

  it("wants an EXIT box from the night's attendees", async () => {
    await lockNight(EXIT, { fixed: "exit" });
    await can("manual", EXIT);
    await rsvp("manual", EXIT, "yes", 0);
    await can("teach", EXIT);
    await rsvp("teach", EXIT, "yes", 0);
    await exec(
      "INSERT INTO exit_game_votes (date_key, user_id, exit_slug) VALUES (?, 'teach', ?)",
      [EXIT, "exit-the-abandoned-cabin"],
    );
    expect(await kindsOf("manual")).toEqual([`exit-vote@${EXIT}`]);
    expect(await kindsOf("teach")).toEqual([]);
  });

  it("counts purchase votes left and a missing collection, sparing admins and online-only members", async () => {
    await addUser("online", "user", "online");
    await exec("DELETE FROM user_inventory WHERE user_id IN ('auto', 'online')");
    const poll = await exec(
      'INSERT INTO purchase_polls (candidate_slugs_json, required_voters) VALUES (\'["azul","brass"]\', 3) RETURNING id',
    );
    const pollId = Number(poll.rows[0]?.id);
    await exec(
      "INSERT INTO purchase_poll_votes (poll_id, user_id, slug) VALUES (?, 'manual', 'azul')",
      [pollId],
    );

    const members = await overview();
    expect(members.manual?.items).toEqual([
      { kind: "purchase-vote", pollId, title: null, votesLeft: 2, votesTotal: 3 },
    ]);
    expect(members.auto?.items.map((i) => i.kind)).toEqual(["purchase-vote", "collection"]);
    expect(members[ADMIN]?.items).toEqual([]);
    expect(members.online?.items).toEqual([]);
  });

  it("creates, edits, ticks and deletes notes, and counts the open ones", async () => {
    const created = await send("POST", "/api/admin/users/auto/notes", {
      text: " Owes 5€ for Azul ",
    });
    expect(created.status).toBe(200);
    const { note } = AdminMemberNoteResponseSchema.parse(await created.json());
    expect(note).toMatchObject({
      text: "Owes 5€ for Azul",
      doneAt: null,
      createdByName: "Name admin",
    });
    await send("POST", "/api/admin/users/auto/notes", { text: "Bring back Brass" });
    expect((await overview()).auto?.openNotes).toBe(2);

    const ticked = await send("PATCH", `/api/admin/users/auto/notes/${note.id}`, {
      done: true,
      text: "Owed 5€",
    });
    expect(AdminMemberNoteResponseSchema.parse(await ticked.json()).note).toMatchObject({
      text: "Owed 5€",
      doneAt: expect.any(String),
    });
    expect((await overview()).auto?.openNotes).toBe(1);

    const list = AdminMemberNotesResponseSchema.parse(
      await (await send("GET", "/api/admin/users/auto/notes")).json(),
    ).notes;
    expect(list.map((n) => n.text)).toEqual(["Bring back Brass", "Owed 5€"]);

    // A note is reached only through its own member.
    expect((await send("DELETE", `/api/admin/users/manual/notes/${note.id}`)).status).toBe(404);
    expect((await send("DELETE", `/api/admin/users/auto/notes/${note.id}`)).status).toBe(200);
    expect(
      (await send("PATCH", `/api/admin/users/auto/notes/${note.id}`, { done: false })).status,
    ).toBe(404);
  });

  it("refuses an empty note, an empty update and an unknown member", async () => {
    expect((await send("POST", "/api/admin/users/auto/notes", { text: "  " })).status).toBe(400);
    expect((await send("POST", "/api/admin/users/nobody/notes", { text: "x" })).status).toBe(404);
    expect((await send("PATCH", "/api/admin/users/auto/notes/1", {})).status).toBe(400);
  });
});
