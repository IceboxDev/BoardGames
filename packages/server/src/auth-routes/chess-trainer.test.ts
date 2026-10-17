// The chess trainer's routes: linking a lichess account (the token is checked
// against lichess once, never stored), storing and paging imported games, and
// saving opening trees and the folder library with a version guard.
//
// Real migration chain, in-memory libsql, the real routes behind an auth stub.

import {
  CHESS_GAMES_PAGE,
  ChessGamesPageSchema,
  ChessLinkResponseSchema,
  ChessUploadGamesResponseSchema,
  LibraryResponseSchema,
  RepertoireSchema,
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

const { chessTrainerRoutes } = await import("./chess-trainer.ts");

const ME = "member-1";
const OTHER = "member-2";
const QUIET = { info() {}, warn() {} };

function app(userId = ME) {
  const a = new Hono<AppEnv>();
  a.use("*", async (c, next) => {
    c.set("user", { id: userId, role: "user" } as AppEnv["Variables"]["user"]);
    await next();
  });
  a.route("/api/trainers/chess", chessTrainerRoutes);
  return a;
}

const json = async (res: Response): Promise<unknown> => res.json();
const page = async (res: Response) => ChessGamesPageSchema.parse(await res.json());
const linkOf = async (res: Response) => ChessLinkResponseSchema.parse(await res.json()).link;

const send = (method: string, path: string, body?: unknown, userId = ME) =>
  app(userId).request(`/api/trainers/chess${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const game = (id: string, playedAt: number, color: "w" | "b" = "w") => ({
  id,
  color,
  uci: "e2e4 e7e5",
  playedAt,
  speed: "blitz",
  rated: true,
  result: "win",
  opponent: "Rival",
  opponentRating: 1500,
});

function lichessAnswers(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("chess trainer routes", () => {
  let client: Client;

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    await client.execute("PRAGMA foreign_keys = ON");
    await runMigrations(client, { logger: QUIET });
    db.current = client;
    for (const id of [ME, OTHER]) {
      await client.execute({
        sql: `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", role)
              VALUES (?, ?, ?, 0, '2020-01-01', '2020-01-01', 'user')`,
        args: [id, id, `${id}@example.com`],
      });
    }
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    client.close();
    db.current = null;
  });

  async function link(id = "trainee") {
    lichessAnswers(200, { id, username: "Trainee" });
    const res = await send("POST", "/link", { token: "lio_secret_token" });
    expect(res.status).toBe(200);
  }

  it("links an account with the token's owner and never stores the token", async () => {
    const fetchMock = lichessAnswers(200, { id: "trainee", username: "Trainee" });
    const res = await send("POST", "/link", { token: "lio_secret_token" });
    expect(await json(res)).toMatchObject({ link: { lichessId: "trainee", gamesCount: 0 } });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://lichess.org/api/account",
      expect.objectContaining({ headers: { Authorization: "Bearer lio_secret_token" } }),
    );
    const dump = await client.execute("SELECT * FROM chess_lichess_links");
    expect(JSON.stringify(dump.rows)).not.toContain("lio_secret_token");
  });

  it("refuses a token lichess rejects", async () => {
    lichessAnswers(401, { error: "No such token" });
    const res = await send("POST", "/link", { token: "lio_bad_token" });
    expect(res.status).toBe(400);
    expect(await linkOf(await send("GET", "/link"))).toBeNull();
  });

  it("stores games once, counts them and pages them back oldest first", async () => {
    expect((await send("POST", "/games", { games: [game("aaaaaaa1", 1)] })).status).toBe(409);
    await link();
    const first = await send("POST", "/games", {
      games: [game("aaaaaaa2", 20), game("aaaaaaa1", 10), game("bbbbbbb1", 15, "b")],
    });
    expect(await json(first)).toMatchObject({
      stored: 3,
      link: { gamesCount: 3, newestGameAt: 20, byColor: { w: 2, b: 1 }, bySpeed: { blitz: 3 } },
    });
    const again = await send("POST", "/games", { games: [game("aaaaaaa1", 10)] });
    expect(ChessUploadGamesResponseSchema.parse(await json(again)).stored).toBe(0);

    const first2 = await page(await send("GET", "/games?color=w"));
    expect(first2.games.map((g) => g.id)).toEqual(["aaaaaaa1", "aaaaaaa2"]);
    expect(first2.next).toBeNull();
    expect((await page(await send("GET", "/games?color=w", undefined, OTHER))).games).toEqual([]);
  });

  it("keeps only a game's legal moves, checked once on import", async () => {
    await link();
    // 3.Ke3 is illegal (e1 can't reach e3): the game is kept up to it.
    await send("POST", "/games", {
      games: [{ ...game("ccccccc1", 5), uci: "e2e4 e7e5 e1e3 g1f3" }],
    });
    const stored = await page(await send("GET", "/games?color=w"));
    expect(stored.games[0]?.uci).toBe("e2e4 e7e5");
  });

  it("pages past the page size with a cursor", async () => {
    await link();
    const games = Array.from({ length: CHESS_GAMES_PAGE + 5 }, (_, i) =>
      game(`g${String(i).padStart(7, "0")}`, 1000 + Math.floor(i / 2)),
    );
    for (let i = 0; i < games.length; i += 1000) {
      await send("POST", "/games", { games: games.slice(i, i + 1000) });
    }
    const one = await page(await send("GET", "/games?color=w"));
    expect(one.games).toHaveLength(CHESS_GAMES_PAGE);
    const two = await page(await send("GET", `/games?color=w&cursor=${one.next}`));
    expect(two.games).toHaveLength(5);
    expect(two.next).toBeNull();
    const ids = new Set([...one.games, ...two.games].map((g) => g.id));
    expect(ids.size).toBe(games.length);
  });

  it("unlinks (games go, trees stay) and re-linking another account drops the old games", async () => {
    await link();
    await send("POST", "/games", { games: [game("aaaaaaa1", 1)] });
    await send("POST", "/repertoires", { name: "e4", color: "w", settings: {} });
    await link("someone-else");
    expect((await linkOf(await send("GET", "/link")))?.gamesCount).toBe(0);
    await send("POST", "/games", { games: [game("aaaaaaa1", 1)] });
    await send("DELETE", "/link");
    expect(await linkOf(await send("GET", "/link"))).toBeNull();
    expect(
      (await client.execute("SELECT COUNT(*) AS n FROM chess_imported_games")).rows[0]?.n,
    ).toBe(0);
    expect(await json(await send("GET", "/repertoires"))).toMatchObject({
      repertoires: [{ name: "e4" }],
    });
  });

  it("saves a tree with a version guard and keeps trees private", async () => {
    const created = RepertoireSchema.parse(
      await json(
        await send("POST", "/repertoires", {
          name: "My e4",
          color: "w",
          settings: { handpickMoves: 2 },
        }),
      ),
    );
    expect(created).toMatchObject({ status: "new", version: 1, tree: null, stats: null });
    const tree = {
      formatVersion: 1,
      color: "w",
      settings: created.settings,
      status: "ready",
      root: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -",
      nodes: {},
      stats: { games: 0, deviated: 0, ended: 0, waiting: 0, avgFollowPlies: 0, decisions: 0 },
    };
    const saved = await send("PUT", `/repertoires/${created.id}`, { expectedVersion: 1, tree });
    expect(await json(saved)).toMatchObject({
      status: "ready",
      version: 2,
      tree: { status: "ready" },
    });
    const stale = await send("PUT", `/repertoires/${created.id}`, {
      expectedVersion: 1,
      name: "x",
    });
    expect(stale.status).toBe(409);
    const wrongColor = await send("PUT", `/repertoires/${created.id}`, {
      expectedVersion: 2,
      tree: { ...tree, color: "b" },
    });
    expect(wrongColor.status).toBe(400);

    expect((await send("GET", `/repertoires/${created.id}`, undefined, OTHER)).status).toBe(404);
    expect((await send("DELETE", `/repertoires/${created.id}`, undefined, OTHER)).status).toBe(404);
    expect((await send("DELETE", `/repertoires/${created.id}`)).status).toBe(204);
  });

  it("keeps each member's folder library, guarded by its version", async () => {
    const lib = async (userId = ME) =>
      LibraryResponseSchema.parse(await (await send("GET", "/library", undefined, userId)).json());
    expect(await lib()).toEqual({
      library: { formatVersion: 1, roots: { w: [], b: [] } },
      version: 0,
    });

    const mine = {
      formatVersion: 1,
      roots: {
        w: [{ kind: "line", id: "alapin01", name: "Alapin", moves: "e2e4 c7c5 c2c3" }],
        b: [],
      },
    };
    const first = await send("PUT", "/library", { expectedVersion: 0, library: mine });
    expect(first.status).toBe(200);
    expect(LibraryResponseSchema.parse(await first.json()).version).toBe(1);
    // A second tab that still thinks it's unsaved, or is a version behind, is refused.
    expect((await send("PUT", "/library", { expectedVersion: 0, library: mine })).status).toBe(409);
    const renamed = { ...mine, roots: { ...mine.roots, b: [] } };
    expect((await send("PUT", "/library", { expectedVersion: 1, library: renamed })).status).toBe(
      200,
    );
    expect((await send("PUT", "/library", { expectedVersion: 1, library: renamed })).status).toBe(
      409,
    );
    expect((await lib()).version).toBe(2);
    // Someone else's library is their own.
    expect((await lib(OTHER)).version).toBe(0);
    const bad = await send("PUT", "/library", {
      expectedVersion: 2,
      library: {
        formatVersion: 1,
        roots: { w: [{ kind: "line", id: "x", name: "", moves: "" }], b: [] },
      },
    });
    expect(bad.status).toBe(400);
  });
});
