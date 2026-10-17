// The chess analysis farm: members queue positions, a worker claims them by
// reach, leases expire, results are checked against the position and shared
// through the cache.
//
// Real migration chain, in-memory libsql, the real routes.

import { START_FEN } from "@boardgames/core/games/chess/engine/fen";
import {
  EvalRequestResponseSchema,
  FarmClaimResponseSchema,
  FarmEnqueueResponseSchema,
  FarmGamesPageSchema,
  type PositionEval,
} from "@boardgames/core/protocol";
import { type Client, createClient } from "@libsql/client";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../auth/types.ts";
import { LEASE_MS } from "../lib/chess-trainer/farm-store.ts";
import { insertGames } from "../lib/chess-trainer/store.ts";
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
const claim = async (
  worker = "ws21",
  max = 8,
  prefer?: string[],
  kinds?: ("user" | "opp")[],
  order?: "reach" | "deep",
) =>
  FarmClaimResponseSchema.parse(
    await (await post("/api/chess-farm/claim", { worker, max, prefer, kinds, order })).json(),
  ).jobs;
const AFTER_D4 = "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1";

function result(fen: string, best: string, over: Partial<PositionEval> = {}): PositionEval {
  return {
    fen,
    kind: "user",
    spec: "BEST_MOVE_V2",
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

  it("hands out the most-reached positions first, preferred ones breaking ties", async () => {
    await ask([
      { fen: START_FEN, kind: "user", reach: 90 },
      { fen: AFTER_E4, kind: "opp", reach: 5 },
      { fen: AFTER_D4, kind: "opp", reach: 5 },
    ]);
    const jobs = await claim("ws21", 3, [AFTER_D4.replace(" 0 1", " 0 3"), AFTER_E4]);
    expect(jobs.map((j) => [j.fen, j.requestedBy])).toEqual([
      [START_FEN, ME],
      [AFTER_D4, ME],
      [AFTER_E4, ME],
    ]);
  });

  it("hands a deep worker its own follow-ups, then the deepest position", async () => {
    const AFTER_E4_E5 = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";
    await ask([
      { fen: START_FEN, kind: "user", reach: 90 },
      { fen: AFTER_E4_E5, kind: "user", reach: 2 },
      { fen: AFTER_D4, kind: "user", reach: 5 },
    ]);
    const deep = await claim("aws-1", 3, [START_FEN], ["user"], "deep");
    expect(deep.map((j) => j.fen)).toEqual([START_FEN, AFTER_E4_E5, AFTER_D4]);
  });

  it("doesn't count a stopped worker's release as an attempt", async () => {
    await ask([{ fen: START_FEN, kind: "user", reach: 9 }]);
    for (let i = 0; i < 4; i++) {
      const [job] = await claim();
      const body = {
        worker: "ws21",
        id: job?.id,
        error: "worker stopped",
        retry: true,
        released: true,
      };
      expect((await post("/api/chess-farm/fail", body)).status).toBe(200);
    }
    expect((await claim())[0]?.attempts).toBe(1);
  });

  it("hands a search the node limit cut short to another worker, never back to its own", async () => {
    await ask([{ fen: START_FEN, kind: "user", reach: 9 }]);
    const [job] = await claim("ws21", 1);
    const body = {
      worker: "ws21",
      id: job?.id,
      error: "node limit on ws21: node limit at depth 39 (needs 50)",
      retry: true,
    };
    expect((await post("/api/chess-farm/fail", body)).status).toBe(200);
    expect(await claim("ws21", 1)).toHaveLength(0);
    expect((await claim("aws-1", 1, [], ["user"], "deep"))[0]?.fen).toBe(START_FEN);
  });

  it("stores Stockfish's best, not a near-equal move a worker picked", async () => {
    await ask([{ fen: START_FEN, kind: "user", reach: 9 }]);
    const [job] = await claim();
    const line = (uci: string, cp: number) => ({
      uci,
      cp,
      mate: null,
      depth: 50,
      seldepth: 70,
      nodes: 6e9,
      pv: [uci],
    });
    const sent = result(START_FEN, "d2d4", {
      lines: [line("e2e4", 31), line("d2d4", 30)],
      ties: ["e2e4", "d2d4"],
    });
    expect(
      (await post("/api/chess-farm/complete", { worker: "ws21", id: job?.id, result: sent }))
        .status,
    ).toBe(200);
    const back = await ask([{ fen: START_FEN, kind: "user", reach: 9 }]);
    expect(back.results[START_FEN]).toMatchObject({ best: "e2e4", ties: ["e2e4"] });
  });

  it("refuses a result short of its depth", async () => {
    await ask([{ fen: START_FEN, kind: "user", reach: 9 }]);
    const [job] = await claim();
    const short = result(START_FEN, "e2e4", {
      depth: 39,
      lines: [
        { uci: "e2e4", cp: 20, mate: null, depth: 39, seldepth: 60, nodes: 2e10, pv: ["e2e4"] },
      ],
    });
    const r = await post("/api/chess-farm/complete", {
      worker: "ws21",
      id: job?.id,
      result: short,
    });
    expect(r.status).toBe(422);
  });

  it("never queues a deviation leaf (an opponent position no game of yours reached)", async () => {
    const r = await ask([
      { fen: AFTER_D4, kind: "opp", reach: 0 },
      { fen: AFTER_E4, kind: "opp", reach: 2 },
    ]);
    expect(r.queued).toBe(1);
    const jobs = await claim();
    expect(jobs.map((j) => j.fen)).toEqual([AFTER_E4]);
  });

  it("never leases one position to two workers", async () => {
    await ask([{ fen: START_FEN, kind: "user", reach: 9 }]);
    expect(await claim("aws-1", 1, [], ["user"], "deep")).toHaveLength(1);
    expect(await claim("ws21", 1, [], ["user"])).toHaveLength(0);
  });

  it("queues a worker's follow-ups for the member, skipping what is already known", async () => {
    await ask([{ fen: START_FEN, kind: "user", reach: 5 }]);
    const [job] = await claim();
    await post("/api/chess-farm/complete", {
      worker: "ws21",
      id: job?.id,
      result: result(START_FEN, "e2e4"),
    });
    const r = await post("/api/chess-farm/enqueue", {
      requestedBy: ME,
      items: [
        { fen: START_FEN, kind: "user", reach: 5 },
        { fen: AFTER_E4, kind: "opp", reach: 5 },
      ],
    });
    expect(FarmEnqueueResponseSchema.parse(await r.json()).queued).toEqual([AFTER_E4]);
    expect((await claim()).map((j) => [j.fen, j.requestedBy])).toEqual([[AFTER_E4, ME]]);
  });

  it("serves a member's games by colour to the worker only", async () => {
    await insertGames(client, ME, [
      {
        id: "abcd1234",
        color: "w",
        uci: "e2e4 e7e5",
        playedAt: 1000,
        speed: "blitz",
        rated: true,
        result: "win",
        opponent: "someone",
        opponentRating: 1500,
      },
    ]);
    const url = `/api/chess-farm/games?user=${ME}&color=w`;
    expect((await app().request(url)).status).toBe(401);
    const page = FarmGamesPageSchema.parse(
      await (await app().request(url, { headers: { authorization: `Bearer ${TOKEN}` } })).json(),
    );
    expect(page).toEqual({
      games: [{ id: "abcd1234", uci: "e2e4 e7e5", result: "win" }],
      next: null,
    });
  });

  it("gives each worker only its kinds: your moves to ws21, opponents' to the fleet", async () => {
    await ask([
      { fen: START_FEN, kind: "user", reach: 90 },
      { fen: AFTER_E4, kind: "opp", reach: 5 },
      { fen: AFTER_D4, kind: "opp", reach: 1 },
    ]);
    const fleet = await claim("aws-1", 8, undefined, ["opp"]);
    expect(fleet.map((j) => j.kind)).toEqual(["opp", "opp"]);
    const ws21 = await claim("ws21", 8, undefined, ["user"]);
    expect(ws21.map((j) => [j.kind, j.fen])).toEqual([["user", START_FEN]]);
    // A restarted fleet worker takes back only its own kind.
    expect((await claim("aws-1", 8, undefined, ["user"])).length).toBe(0);
    expect((await claim("aws-1", 8, undefined, ["opp"])).length).toBe(2);
  });
});
