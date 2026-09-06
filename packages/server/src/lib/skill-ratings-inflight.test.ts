// The in-flight recompute guard is keyed by MODE. A boot-time `reset` must
// not swallow the admin's `rotate`: the admin's Recompute has one job —
// rotate the baseline — and returning a running reset's result would skip
// it while reporting success. A rotate asked during a reset therefore runs
// as its own rotate afterwards; rotates asked during a rotate join it.
//
// In-memory libsql answers without real I/O, so a whole recompute can finish
// between two timer ticks. The test therefore holds the match-rows read
// behind a gate it controls, which pins the run "in flight" deterministically.

import { type Client, createClient, type InStatement } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "../migrations/migrator.ts";

const db = vi.hoisted(() => ({ current: null as Client | null }));
vi.mock("../db.ts", () => ({
  getDb: () => db.current,
  getDbConnectionConfig: () => ({ url: ":memory:", authToken: undefined }),
}));

const { __test__, ensureSkillState, forceSkillRecompute } = await import("./skill-ratings.ts");

const QUIET = { info() {}, warn() {} };
const MATCH_ROWS_SQL = "FROM match_results ORDER BY id";

function deferred(): { promise: Promise<void>; open: () => void } {
  let open: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

/** `client`, except the recompute's match read waits for `gate` first. */
function gated(client: Client, gate: Promise<void>): Client {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop !== "execute") {
        const value = Reflect.get(target, prop, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      }
      return async (stmt: InStatement) => {
        const sql = typeof stmt === "string" ? stmt : stmt.sql;
        if (sql.includes(MATCH_ROWS_SQL)) await gate;
        return target.execute(stmt);
      };
    },
  });
}

async function addUser(client: Client, id: string): Promise<void> {
  await client.execute({
    sql: `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", guest, internal)
          VALUES (?, ?, ?, 0, '2020-01-01', '2020-01-01', 0, 0)`,
    args: [id, id.toUpperCase(), `${id}@example.com`],
  });
}

async function addMatch(client: Client, winner: string, loser: string): Promise<void> {
  const outcome = {
    kind: "free-for-all",
    players: [
      { userId: winner, displayName: winner, score: 10, rank: 1 },
      { userId: loser, displayName: loser, score: 5, rank: 2 },
    ],
  };
  await client.execute({
    sql: `INSERT INTO match_results
            (date_key, played_at, game_slug, game_title, outcome_json, recorded_by, recorded_at)
          VALUES (NULL, '2026-01-01T18:00:00.000Z', 'chess', 'Chess', ?, ?, datetime('now'))`,
    args: [JSON.stringify(outcome), winner],
  });
}

/** Let queued promise continuations run until `mode` is reported in flight. */
async function untilInFlight(mode: "reset" | "rotate"): Promise<void> {
  for (let i = 0; i < 50; i++) {
    if (__test__.inFlightMode() === mode) return;
    await new Promise((r) => setTimeout(r, 0));
  }
  throw new Error(`no ${mode} recompute in flight`);
}

describe("skill recompute in-flight guard", () => {
  let client: Client;

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    await client.execute("PRAGMA foreign_keys = ON");
    await runMigrations(client, { logger: QUIET });
    db.current = client;
    for (const id of ["alice", "bob"]) await addUser(client, id);
    await addMatch(client, "alice", "bob");
    await forceSkillRecompute();
    __test__.runLog.length = 0;
  });

  afterEach(() => {
    client.close();
    db.current = null;
  });

  it("runs the admin's rotate after a reset instead of returning the reset's result", async () => {
    // Make the stored state look like it came from an older engine, so the
    // next read heals it with a reset — exactly what boot does.
    await client.execute("UPDATE skill_rating_state SET engine_fingerprint = 'stale-engine'");
    const gate = deferred();
    db.current = gated(client, gate.promise);

    const reset = ensureSkillState();
    await untilInFlight("reset");
    const rotate = forceSkillRecompute();
    expect(__test__.inFlightMode()).toBe("reset");

    gate.open();
    await Promise.all([reset, rotate]);
    expect(__test__.runLog).toEqual(["reset", "rotate"]);
    expect(__test__.inFlightMode()).toBeNull();
  });

  it("lets a second rotate join a running rotate", async () => {
    const gate = deferred();
    db.current = gated(client, gate.promise);

    const first = forceSkillRecompute();
    await untilInFlight("rotate");
    const second = forceSkillRecompute();

    gate.open();
    await Promise.all([first, second]);
    expect(__test__.runLog).toEqual(["rotate"]);
  });

  it("lets a reset join whatever is running", async () => {
    const gate = deferred();
    db.current = gated(client, gate.promise);

    const rotate = forceSkillRecompute();
    await untilInFlight("rotate");
    await client.execute("UPDATE skill_rating_state SET engine_fingerprint = 'stale-engine'");
    const healed = ensureSkillState();

    gate.open();
    await Promise.all([rotate, healed]);
    expect(__test__.runLog).toEqual(["rotate"]);
  });
});
