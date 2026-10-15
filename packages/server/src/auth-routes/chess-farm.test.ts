// The chess analysis farm: members queue positions, a worker claims them by
// reach, leases expire, results are checked against the position and shared
// through the cache.
//
// Real migration chain, in-memory libsql, the real routes.

import { START_FEN } from "@boardgames/core/games/chess/engine/fen";
import {
  EvalRequestResponseSchema,
  FarmClaimResponseSchema,
  type PositionEval,
} from "@boardgames/core/protocol";
import { type Client, createClient } from "@libsql/client";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../auth/types.ts";
import { LEASE_MS } from "../lib/chess-trainer/farm-store.ts";
import { runMigrations } from "../migrations/migrator.ts";

const db = vi.hoisted(() => ({ current: null as Client | null }));
vi.mock("../db.ts", () => ({
  getDb: () => db.current,
  getDbConnectionConfig: () => ({ url: ":memory:", authToken: undefined }),
}));

const { chessFarmRoutes } = await import("./chess-farm.ts");
const { chessTrainerRoutes } = await import("./chess-trainer.ts");

const ME = "member-1";
const TOKEN = "farm-secret-token";
const QUIET = { info() {}, warn() {} };
const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

function app() {
  const a = new Hono<AppEnv>();
  a.use("/api/trainers/*", async (c, next) => {
    c.set("user", { id: ME, role: "user" } as AppEnv["Variables"]["user"]);
    await next();
  });
  a.route("/api/trainers/chess", chessTrainerRoutes);
  a.route("/api/chess-farm", chessFarmRoutes);
  return a;
}

const post = (path: string, body: unknown, token: string | null = TOKEN) =>
  app().request(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

const ask = async (items: { fen: string; kind: "user" | "opp"; reach: number }[]) =>
  EvalRequestResponseSchema.parse(
    await (await post("/api/trainers/chess/evals", { items })).json(),
  );
const claim = async (worker = "ws21", max = 8) =>
  FarmClaimResponseSchema.parse(await (await post("/api/chess-farm/claim", { worker, max })).json())
    .jobs;

function result(fen: string, best: string, over: Partial<PositionEval> = {}): PositionEval {
  return {
    fen,
    kind: "user",
    spec: "BEST_MOVE_V1",
    best,
    lines: [{ uci: best, cp: 20, mate: null, depth: 50, seldepth: 70, nodes: 6e9, pv: [best] }],
    lc0: null,
    ties: [best],
    contested: false,
    depth: 50,
    source: "farm",
    engine: "stockfish-dev-20261013",
    seconds: 200,
    ...over,
  };
}

describe("chess analysis farm", () => {
  let client: Client;

  beforeEach(async () => {
    vi.stubEnv("CHESS_FARM_TOKEN", TOKEN);
    client = createClient({ url: ":memory:" });
    await client.execute("PRAGMA foreign_keys = ON");
    await runMigrations(client, { logger: QUIET });
    db.current = client;
    await client.execute({
      sql: `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", role)
            VALUES (?, ?, ?, 0, '2020-01-01', '2020-01-01', 'user')`,
      args: [ME, ME, `${ME}@example.com`],
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    client.close();
    db.current = null;
  });

  it("refuses a missing or wrong token, and is off without one configured", async () => {
    expect((await post("/api/chess-farm/claim", { worker: "x", max: 1 }, null)).status).toBe(401);
    expect((await post("/api/chess-farm/claim", { worker: "x", max: 1 }, "nope")).status).toBe(401);
    vi.stubEnv("CHESS_FARM_TOKEN", "");
    expect((await post("/api/chess-farm/claim", { worker: "x", max: 1 })).status).toBe(503);
  });

  it("queues unknown positions once, keeping the highest reach, and hands out the most reached first", async () => {
    const first = await ask([
      { fen: START_FEN, kind: "user", reach: 3 },
      { fen: AFTER_E4, kind: "opp", reach: 40 },
    ]);
    expect(first).toMatchObject({ results: {}, queued: 2, farm: { queued: 2 } });
    await ask([{ fen: START_FEN.replace(" 0 1", " 4 9"), kind: "user", reach: 60 }]);
    const jobs = await claim();
    expect(jobs.map((j) => [j.kind, j.reach])).toEqual([
      ["user", 60],
      ["opp", 40],
    ]);
    expect(await claim("other")).toEqual([]);
  });

  it("re-leases a job whose worker went quiet", async () => {
    await ask([{ fen: START_FEN, kind: "user", reach: 1 }]);
    const [job] = await claim("ws21");
    await client.execute({
      sql: "UPDATE chess_eval_jobs SET claimed_at_ms = ? WHERE id = ?",
      args: [Date.now() - LEASE_MS - 1000, job?.id ?? 0],
    });
    const again = await claim("ws21-b");
    expect(again.map((j) => [j.id, j.attempts])).toEqual([[job?.id, 2]]);
    // The first worker's late result is refused: the lease is gone.
    const late = await post("/api/chess-farm/complete", {
      worker: "ws21",
      id: job?.id,
      result: result(START_FEN, "e2e4"),
    });
    expect(late.status).toBe(409);
  });

  it("checks results against the position and serves them from the cache", async () => {
    await ask([{ fen: START_FEN, kind: "user", reach: 5 }]);
    const [job] = await claim();
    const illegal = await post("/api/chess-farm/complete", {
      worker: "ws21",
      id: job?.id,
      result: result(START_FEN, "e2e5"),
    });
    expect(illegal.status).toBe(422);
    const wrongKind = await post("/api/chess-farm/complete", {
      worker: "ws21",
      id: job?.id,
      result: result(START_FEN, "e2e4", { kind: "opp" }),
    });
    expect(wrongKind.status).toBe(422);
    const ok = await post("/api/chess-farm/complete", {
      worker: "ws21",
      id: job?.id,
      result: result(START_FEN, "e2e4"),
    });
    expect(ok.status).toBe(200);

    const cached = await ask([{ fen: START_FEN.replace(" 0 1", " 0 7"), kind: "user", reach: 5 }]);
    expect(cached.queued).toBe(0);
    expect(Object.values(cached.results)[0]).toMatchObject({ best: "e2e4", depth: 50 });
    expect((await ask([{ fen: START_FEN, kind: "opp", reach: 5 }])).queued).toBe(1);
  });

  it("puts a failed job back until its attempts run out", async () => {
    await ask([{ fen: START_FEN, kind: "user", reach: 1 }]);
    for (let attempt = 1; attempt <= 3; attempt++) {
      const [job] = await claim();
      expect(job?.attempts).toBe(attempt);
      const r = await post("/api/chess-farm/fail", {
        worker: "ws21",
        id: job?.id,
        error: "engine crashed",
        retry: true,
      });
      expect(r.status).toBe(200);
    }
    expect(await claim()).toEqual([]);
    const status = await app().request("/api/chess-farm/status", {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(await status.json()).toMatchObject({ failed: 1, queued: 0 });
  });
});
