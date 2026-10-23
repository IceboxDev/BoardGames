// The chess drill API end to end: real migration chain, in-memory libsql,
// the real routes behind an auth stub.

import type { ChessDrillOverview, ChessDrillReviewBody } from "@boardgames/core/protocol";
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

const { chessDrillRoutes } = await import("./chess-drill.ts");

const USER = "member-1";
const OTHER = "member-2";
const QUIET = { info() {}, warn() {} };
const TODAY = new Date().toISOString().slice(0, 10);
const CARD = "rnbqkbnr/ppppppp1/8/7p/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -";

function app(viewerId: string) {
  const a = new Hono<AppEnv>();
  a.use("*", async (c, next) => {
    c.set("user", { id: viewerId, role: "user" } as AppEnv["Variables"]["user"]);
    await next();
  });
  a.route("/api/trainers/chess/drill", chessDrillRoutes);
  return a;
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown, viewerId = USER) {
  const res = await app(viewerId).request(`/api/trainers/chess/drill${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as T };
}

let seq = 0;
function review(over: Partial<ChessDrillReviewBody> = {}): ChessDrillReviewBody {
  seq++;
  return {
    clientId: `client-${String(seq).padStart(6, "0")}`,
    color: "w",
    cardId: CARD,
    grade: "good",
    localDate: TODAY,
    outcome: { played: "d2d4", expected: "d2d4", hinted: false },
    ...over,
  };
}

const overview = (color: "w" | "b", viewerId = USER) =>
  call<ChessDrillOverview>("GET", `/${color}/overview?today=${TODAY}`, undefined, viewerId);

describe("chess drill routes", () => {
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

  afterEach(() => client.close());

  it("schedules a graded card in its colour's deck, once per clientId", async () => {
    const body = review();
    const first = await call<{ existed: boolean; state: { state: string } | null }>(
      "POST",
      "/reviews",
      body,
    );
    expect(first.status).toBe(201);
    expect(first.body.state?.state).toBe("learning");
    const replay = await call<{ existed: boolean }>("POST", "/reviews", body);
    expect(replay.status).toBe(200);
    expect(replay.body.existed).toBe(true);

    const white = await overview("w");
    expect(white.body.states.map((s) => s.questionId)).toEqual([CARD]);
    expect(white.body.today).toEqual({ reviews: 1, correct: 1 });
    expect(white.body.introducedToday).toBe(1);
    expect((await overview("b")).body.states).toEqual([]);
    expect((await overview("w", OTHER)).body.states).toEqual([]);
  });

  it("refuses a malformed card and an unknown colour", async () => {
    expect((await call("POST", "/reviews", review({ cardId: "e4" }))).status).toBe(400);
    expect((await call("GET", `/x/overview?today=${TODAY}`)).status).toBe(404);
  });

  it("takes a backlog in bulk", async () => {
    const res = await call<{ applied: number; skipped: number }>("POST", "/reviews/bulk", {
      reviews: [review(), review({ color: "b", cardId: CARD.replace(" w ", " b ") })],
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ applied: 2, skipped: 0 });
    expect((await overview("b")).body.states).toHaveLength(1);
  });
});
