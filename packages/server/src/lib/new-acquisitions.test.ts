// The multi-member New-in-library query behind the profile grid and the night
// picker: one rule for everyone (dated, not played through, unplayed since),
// and the picker's "new to one attending owner = new for the table" union.
//
// Real migration chain, in-memory libsql.

import { type Client, createClient } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../migrations/migrator.ts";
import { computeAvailableGamesPayload } from "./available-games.ts";
import { fetchNewSlugs, fetchNewSlugsByUser } from "./new-acquisitions.ts";

const QUIET = { info() {}, warn() {} };
const ANA = "ana";
const BEN = "ben";
const CAL = "cal";
const DATE = "2026-09-20";

describe("new acquisitions", () => {
  let client: Client;

  async function item(userId: string, slug: string, acquiredOn: string, playedThrough = false) {
    await client.execute({
      sql: `INSERT INTO collection_items (id, user_id, slug, acquired_on, played_through_at)
            VALUES (?, ?, ?, ?, ?)`,
      args: [`${userId}-${slug}`, userId, slug, acquiredOn, playedThrough ? "2026-09-01" : null],
    });
  }

  async function play(slug: string, playedAt: string, participants: string[]) {
    const r = await client.execute({
      sql: `INSERT INTO match_results
              (date_key, played_at, game_slug, game_title, outcome_json, recorded_by, sort_order)
            VALUES (NULL, ?, ?, ?, '{}', ?, 0)`,
      args: [playedAt, slug, slug, ANA],
    });
    for (const userId of participants) {
      await client.execute({
        sql: "INSERT INTO match_participants (match_id, user_id) VALUES (?, ?)",
        args: [Number(r.lastInsertRowid), userId],
      });
    }
  }

  async function inventory(userId: string, slugs: string[]) {
    await client.execute({
      sql: "INSERT INTO user_inventory (user_id, game_slugs_json) VALUES (?, ?)",
      args: [userId, JSON.stringify(slugs)],
    });
  }

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    await client.execute("PRAGMA foreign_keys = ON");
    await runMigrations(client, { logger: QUIET });
    for (const id of [ANA, BEN, CAL]) {
      await client.execute({
        sql: `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", role)
              VALUES (?, ?, ?, 0, '2020-01-01', '2020-01-01', 'user')`,
        args: [id, id, `${id}@example.com`],
      });
    }
  });

  afterEach(() => client.close());

  it("applies the one rule per member: dated, not played through, unplayed since", async () => {
    await item(ANA, "wingspan", "2026-09-10"); // new
    await item(ANA, "catan", "2026-09-10", true); // played through → not new
    await item(ANA, "azul", "2026-09-10"); // played after → not new
    await play("azul", "2026-09-12 20:00:00", [ANA]);
    await item(BEN, "azul", "2026-09-14"); // Ben's copy: his only play predates it
    await play("azul", "2026-09-13 20:00:00", [BEN]);
    await item(CAL, "wingspan", "2026-09-10"); // Cal isn't asked about

    const byUser = await fetchNewSlugsByUser(client, [ANA, BEN]);
    expect([...(byUser.get(ANA) ?? [])]).toEqual(["wingspan"]);
    expect([...(byUser.get(BEN) ?? [])]).toEqual(["azul"]);
    expect(byUser.has(CAL)).toBe(false);
  });

  it("a member's list is restricted to what they still own", async () => {
    await item(ANA, "wingspan", "2026-09-10");
    await item(ANA, "catan", "2026-09-10");
    expect(await fetchNewSlugs(client, ANA, new Set(["catan"]))).toEqual(["catan"]);
    expect(await fetchNewSlugs(client, ANA, new Set())).toEqual([]);
    expect(await fetchNewSlugsByUser(client, [])).toEqual(new Map());
  });

  it("the picker shows a copy new to any ATTENDING owner, and only owned copies", async () => {
    await client.execute({
      sql: "INSERT INTO locked_dates (date_key, locked_by, expected_user_ids_json) VALUES (?, ?, '[]')",
      args: [DATE, ANA],
    });
    for (const id of [ANA, BEN]) {
      await client.execute({
        sql: "INSERT INTO rsvps (date_key, user_id, status) VALUES (?, ?, 'yes')",
        args: [DATE, id],
      });
    }
    await inventory(ANA, ["wingspan", "catan"]);
    await inventory(BEN, ["azul"]);
    await inventory(CAL, ["catan"]);
    await item(ANA, "wingspan", "2026-09-10"); // Ana attends → new for the table
    await item(BEN, "catan", "2026-09-10"); // dated but Ben no longer owns it → not new
    await item(CAL, "catan", "2026-09-10"); // Cal owns + new, but isn't coming → not new

    const view = await computeAvailableGamesPayload({ db: client, date: DATE, viewerId: ANA });
    expect(view?.wire.ownedSlugs).toEqual(["azul", "catan", "wingspan"]);
    expect(view?.wire.newSlugs).toEqual(["wingspan"]);
  });
});
