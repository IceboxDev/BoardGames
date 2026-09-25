// The geography trainer API end to end: real migration chain, in-memory
// libsql, the real routes behind an auth stub, the real deck.

import type { GeoOverview, GeoReviewBody, GeoReviewResponse } from "@boardgames/core/protocol";
import { addDays } from "@boardgames/core/trainers/srs";
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

const { geographyRoutes } = await import("./geography.ts");

const USER = "member-1";
const OTHER = "member-2";
const QUIET = { info() {}, warn() {} };
const TODAY = new Date().toISOString().slice(0, 10);

function app(viewerId = USER) {
  const a = new Hono<AppEnv>();
  a.use("*", async (c, next) => {
    c.set("user", { id: viewerId, role: "user" } as AppEnv["Variables"]["user"]);
    await next();
  });
  a.route("/api/trainers/geography", geographyRoutes);
  return a;
}

async function call<T>(
  method: "GET" | "POST" | "PUT",
  path: string,
  body?: unknown,
  viewerId = USER,
): Promise<{ status: number; body: T }> {
  const res = await app(viewerId).request(`/api/trainers/geography${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as T };
}

let seq = 0;
function review(overrides: Partial<GeoReviewBody> = {}): GeoReviewBody {
  seq++;
  return {
    clientId: `client-${String(seq).padStart(6, "0")}`,
    cardId: "ct:eu:s1",
    grade: "good",
    localDate: TODAY,
    outcome: { verdict: "correct" },
    ...overrides,
  };
}

const post = (body: GeoReviewBody, viewerId = USER) =>
  call<GeoReviewResponse>("POST", "/reviews", body, viewerId);
const overview = (viewerId = USER) =>
  call<GeoOverview>("GET", `/overview?today=${TODAY}`, undefined, viewerId);

describe("geography trainer routes", () => {
  let client: Client;

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    await client.execute("PRAGMA foreign_keys = ON");
    await runMigrations(client, { logger: QUIET });
    db.current = client;
    for (const id of [USER, OTHER]) {
      await client.execute({
        sql: `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", role)
              VALUES (?, ?, ?, 0, '2020-01-01', '2020-01-01', 'user')`,
        args: [id, id, `${id}@example.com`],
      });
    }
  });

  afterEach(() => {
    client.close();
    db.current = null;
  });

  it("starts empty with default settings", async () => {
    const { status, body } = await overview();
    expect(status).toBe(200);
    expect(body.states).toEqual([]);
    expect(body.settings.newPerDay).toBe(5);
    expect(body.introducedToday).toEqual({ places: 0, names: 0 });
    expect(body.streak.current).toBe(0);
  });

  it("grades a card, keeps the outcome, and counts it as introduced today", async () => {
    const r = review({
      cardId: "co:DEU:s1",
      outcome: { verdict: "near", distanceKm: 120, confusedWith: "co:AUT" },
    });
    const first = await post({ ...r, grade: "hard" });
    expect(first.status).toBe(201);
    expect(first.body.state).toMatchObject({ questionId: "co:DEU:s1", state: "learning" });
    const { rows } = await client.execute("SELECT outcome_json, grade FROM trainer_reviews");
    expect(JSON.parse(String(rows[0].outcome_json))).toMatchObject({ distanceKm: 120 });
    const o = await overview();
    expect(o.body.states).toHaveLength(1);
    expect(o.body.introducedToday).toEqual({ places: 1, names: 0 });
    expect(o.body.streak).toMatchObject({ current: 1, studiedToday: true });
    expect(o.body.today).toEqual({ reviews: 1, correct: 1 });
    // Another member sees nothing.
    expect((await overview(OTHER)).body.states).toEqual([]);
  });

  it("counts countries started today against the budget, but not continents or later stages", async () => {
    await post(review({ cardId: "ct:eu:s1" }));
    await post(review({ cardId: "co:DEU:s1" }));
    await post(review({ cardId: "co:DEU:s2" }));
    const o = await overview();
    expect(o.body.introducedToday).toEqual({ places: 1, names: 0 });
  });

  it("is idempotent on clientId", async () => {
    const r = review();
    expect((await post(r)).status).toBe(201);
    const again = await post(r);
    expect(again.status).toBe(200);
    expect(again.body.existed).toBe(true);
    expect(again.body.state?.reps).toBe(1);
  });

  it("rejects unknown cards and implausible dates", async () => {
    expect((await post(review({ cardId: "co:XYZ:s1" }))).status).toBe(404);
    expect((await post(review({ localDate: addDays(TODAY, -40) }))).status).toBe(400);
    expect((await post(review({ cardId: "nope" }))).status).toBe(400);
  });

  it("lets a drill reschedule only a card that is due", async () => {
    const drill = await post(review({ source: "drill" }));
    expect(drill.body.applied).toBe(false);
    expect(drill.body.state).toBeNull();
    await post(review());
    const notDue = await post(review({ source: "drill" }));
    expect(notDue.body.applied).toBe(false);
  });

  it("replays in bulk and resets", async () => {
    const bulk = await call<{ applied: number; skipped: number }>("POST", "/reviews/bulk", {
      reviews: [review(), review({ cardId: "ct:as:s1" }), review({ cardId: "co:XYZ:s2" })],
    });
    expect(bulk.body).toMatchObject({ applied: 2, skipped: 1 });
    const reset = await call<{ deleted: { states: number; reviews: number } }>("POST", "/reset", {
      confirm: true,
    });
    expect(reset.body.deleted).toEqual({ states: 2, reviews: 2 });
    expect((await overview()).body.states).toEqual([]);
  });

  it("stores settings per member and serves history", async () => {
    const put = await call("PUT", "/settings", { newPerDay: 8, focus: "af" });
    expect(put.status).toBe(200);
    expect((await overview()).body.settings).toMatchObject({ newPerDay: 8, focus: "af" });
    expect((await overview(OTHER)).body.settings.newPerDay).toBe(5);
    await post(review({ grade: "again", outcome: { verdict: "wrong" } }));
    const h = await call<{ days: { again: number; newIntroduced: number }[] }>(
      "GET",
      `/history?today=${TODAY}&days=7`,
    );
    expect(h.body.days).toEqual([{ date: TODAY, reviews: 1, good: 0, again: 1, newIntroduced: 1 }]);
  });
});
