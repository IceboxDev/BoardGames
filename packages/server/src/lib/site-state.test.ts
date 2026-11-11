// Site hibernation is a freeze, not a wipe: hibernating and waking touch
// nothing but `site_state`, and the calendar feed cancels upcoming nights
// while asleep and restores them on wake, with SEQUENCE rising both times so
// subscribed calendars accept each change.
//
// Real migration chain, in-memory libsql, the real feed route.

import { hashFeedToken } from "@boardgames/core/ical/token";
import { type Client, createClient } from "@libsql/client";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "../migrations/migrator.ts";

const db = vi.hoisted(() => ({ current: null as Client | null }));
vi.mock("../db.ts", () => ({
  getDb: () => db.current,
  getDbConnectionConfig: () => ({ url: ":memory:", authToken: undefined }),
}));

const { computeMemorial, getSiteState, hibernate, resetSiteStateCache, siteLog, todayKey, wake } =
  await import("./site-state.ts");
const { calendarFeedPublicRoutes } = await import("../auth-routes/calendar-feed-public.ts");

const ADMIN = "admin-1";
const MEMBER = "member-1";
const TOKEN = `cs_${"a".repeat(43)}`;
const QUIET = { info() {}, warn() {} };

function shiftDays(key: string, days: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const TODAY = todayKey();
const PAST = shiftDays(TODAY, -7);
const FUTURE = shiftDays(TODAY, 7);

/** Every table hibernation must leave untouched, as one comparable string. */
async function snapshot(client: Client): Promise<string> {
  const out: unknown[] = [];
  for (const table of ["locked_dates", "rsvps", "user", "calendar_feed_tokens", "match_results"]) {
    const { rows } = await client.execute(`SELECT * FROM "${table}" ORDER BY 1`);
    out.push(table, rows);
  }
  return JSON.stringify(out);
}

describe("site hibernation", () => {
  let client: Client;
  const feed = new Hono().route("/api/ical", calendarFeedPublicRoutes);

  async function events(): Promise<{ status: string; sequence: number; date: string }[]> {
    const res = await feed.request(`/api/ical/feed/${TOKEN}/calendar.ics`);
    expect(res.status).toBe(200);
    const body = await res.text();
    return body
      .split("BEGIN:VEVENT")
      .slice(1)
      .map((ev) => ({
        status: /STATUS:(\w+)/.exec(ev)?.[1] ?? "",
        sequence: Number(/SEQUENCE:(\d+)/.exec(ev)?.[1]),
        date: /DTSTART[^:]*:(\d{8})/.exec(ev)?.[1] ?? "",
      }));
  }
  const compact = (k: string) => k.replaceAll("-", "");

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    await client.execute("PRAGMA foreign_keys = ON");
    await runMigrations(client, { logger: QUIET });
    db.current = client;
    resetSiteStateCache();

    for (const [id, role] of [
      [ADMIN, "admin"],
      [MEMBER, "user"],
    ]) {
      await client.execute({
        sql: `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", role)
              VALUES (?, ?, ?, 0, '2020-01-01', '2020-01-01', ?)`,
        args: [id, id, `${id}@example.com`, role ?? "user"],
      });
    }
    for (const date of [PAST, FUTURE]) {
      await client.execute({
        sql: `INSERT INTO locked_dates (date_key, locked_by, expected_user_ids_json, host_user_id, host_name)
              VALUES (?, ?, ?, ?, 'Host')`,
        args: [date, ADMIN, JSON.stringify([MEMBER]), ADMIN],
      });
    }
    await client.execute({
      sql: "INSERT INTO calendar_feed_tokens (user_id, token_hash) VALUES (?, ?)",
      args: [MEMBER, await hashFeedToken(TOKEN)],
    });
    await client.execute({
      sql: `INSERT INTO match_results (date_key, game_slug, game_title, outcome_json, recorded_by)
            VALUES (?, 'lost-cities', 'Lost Cities', '{}', ?)`,
      args: [PAST, ADMIN],
    });
  });

  afterEach(() => {
    client.close();
    db.current = null;
  });

  it("starts awake", async () => {
    expect(await getSiteState()).toEqual({ hibernatedAt: null, memorial: null });
  });

  it("freezes the memorial at the moment of hibernation", async () => {
    const state = await hibernate(ADMIN);
    expect(state.hibernatedAt).not.toBeNull();
    expect(state.memorial).toMatchObject({
      nights: 1,
      matches: 1,
      members: 2,
      firstNight: PAST,
      lastNight: PAST,
    });
    expect(state.memorial?.topGames[0]).toMatchObject({ slug: "lost-cities", plays: 1 });
    // A match recorded later doesn't move the frozen numbers.
    expect((await computeMemorial()).matches).toBe(1);
  });

  it("is idempotent and logs each real change once", async () => {
    const first = await hibernate(ADMIN);
    const second = await hibernate(ADMIN);
    expect(second.hibernatedAt).toBe(first.hibernatedAt);
    await wake(ADMIN);
    await wake(ADMIN);
    expect((await siteLog()).map((e) => e.action)).toEqual(["wake", "hibernate"]);
    expect((await getSiteState()).hibernatedAt).toBeNull();
  });

  it("touches nothing but its own row: a hibernate + wake round trip restores every table", async () => {
    await events(); // the feed's own version rows are allowed to move; nights are not
    const before = await snapshot(client);
    await hibernate(ADMIN);
    await events();
    await wake(ADMIN);
    expect(await snapshot(client)).toBe(before);
  });

  it("cancels upcoming nights in the feed while asleep and restores them on wake", async () => {
    const awake = await events();
    const future = () => awake.find((e) => e.date === compact(FUTURE));
    expect(future()).toMatchObject({ status: "CONFIRMED" });
    const pastAwake = awake.find((e) => e.date === compact(PAST));
    expect(pastAwake?.status).toBe("CONFIRMED");

    await hibernate(ADMIN);
    const asleep = await events();
    const futureAsleep = asleep.find((e) => e.date === compact(FUTURE));
    expect(futureAsleep?.status).toBe("CANCELLED");
    expect(futureAsleep?.sequence).toBeGreaterThan(future()?.sequence ?? -1);
    // History stays as it was.
    expect(asleep.find((e) => e.date === compact(PAST))).toEqual(pastAwake);

    await wake(ADMIN);
    const woken = await events();
    const futureWoken = woken.find((e) => e.date === compact(FUTURE));
    expect(futureWoken?.status).toBe("CONFIRMED");
    expect(futureWoken?.sequence).toBeGreaterThan(futureAsleep?.sequence ?? -1);
  });
});
