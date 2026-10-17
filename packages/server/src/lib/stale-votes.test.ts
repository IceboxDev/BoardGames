// Admins see a person's votes as outdated once the night's headcount has moved
// on from the one they were cast at (`game_requests.headcount`, migration
// 0059). Votes from before the column existed (NULL) are never flagged, and
// nobody but an admin gets the flag.
//
// Real migration chain, in-memory libsql.

import { type Client, createClient } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../migrations/migrator.ts";
import { computeAvailableGamesPayload } from "./available-games.ts";

const QUIET = { info() {}, warn() {} };
const ANA = "ana";
const BEN = "ben";
const CAL = "cal";
const DATE = "2026-09-20";

describe("outdated votes", () => {
  let client: Client;

  async function vote(userId: string, reaction: string, headcount: number | null) {
    await client.execute({
      sql: `INSERT INTO game_requests (date_key, user_id, game_slug, reaction, headcount)
            VALUES (?, ?, 'wingspan', ?, ?)`,
      args: [DATE, userId, reaction, headcount],
    });
  }

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    await client.execute("PRAGMA foreign_keys = ON");
    await runMigrations(client, { logger: QUIET });
    for (const id of [ANA, BEN, CAL]) {
      await client.execute({
        sql: `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", role)
              VALUES (?, ?, ?, 0, '2020-01-01', '2020-01-01', ?)`,
        args: [id, id, `${id}@example.com`, id === ANA ? "admin" : "user"],
      });
    }
    await client.execute({
      sql: "INSERT INTO locked_dates (date_key, locked_by, expected_user_ids_json) VALUES (?, ?, '[]')",
      args: [DATE, ANA],
    });
    for (const id of [ANA, BEN, CAL]) {
      await client.execute({
        sql: "INSERT INTO rsvps (date_key, user_id, status) VALUES (?, ?, 'yes')",
        args: [DATE, id],
      });
    }
    await client.execute({
      sql: "INSERT INTO user_inventory (user_id, game_slugs_json) VALUES (?, ?)",
      args: [ANA, JSON.stringify(["wingspan"])],
    });
    await vote(ANA, "hype", 3); // cast at tonight's 3
    await vote(BEN, "hype", 2); // cast when 2 were coming
    await vote(BEN, "teach", 5); // …and when 5 were
    await vote(CAL, "hype", null); // before headcounts were recorded
  });

  afterEach(() => client.close());

  it("flags each person's votes cast at another headcount, for admins", async () => {
    const view = await computeAvailableGamesPayload({
      db: client,
      date: DATE,
      viewerId: ANA,
      viewerIsAdmin: true,
    });
    expect(view?.headcount).toBe(3);
    const stale = Object.fromEntries(
      (view?.wire.attendees ?? []).map((a) => [a.userId, a.staleVotes]),
    );
    expect(stale).toEqual({
      [ANA]: null,
      [BEN]: { count: 2, headcounts: [2, 5] },
      [CAL]: null,
    });
  });

  it("never shows the flag to anyone else", async () => {
    const view = await computeAvailableGamesPayload({ db: client, date: DATE, viewerId: BEN });
    expect(view?.wire.attendees.every((a) => a.staleVotes === null)).toBe(true);
  });
});
