// Onboarding state end to end on a migrated in-memory database: the 0051
// backfill, when the tour and the hints are due, and the atomic writes.

import { type Client, createClient } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../migrations/migrator.ts";
import { migrations } from "../migrations/registry.ts";
import { answerDeck, deckDue, hintsDue, markHintSeen, readOnboarding } from "./onboarding.ts";

const QUIET = { info() {}, warn() {} };
let client: Client;

async function addUser(id: string) {
  await client.execute({
    sql: `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", role)
          VALUES (?, ?, ?, 0, '2020-01-01', '2020-01-01', 'user')`,
    args: [id, id, `${id}@example.com`],
  });
}

beforeEach(() => {
  client = createClient({ url: ":memory:" });
});

afterEach(() => {
  client.close();
});

describe("migration 0051", () => {
  it("marks everyone who already had an account as an existing member", async () => {
    const before = migrations.filter((m) => m.name !== "onboarding");
    await runMigrations(client, { logger: QUIET, migrations: before });
    await addUser("old-timer");
    await runMigrations(client, { logger: QUIET });
    await addUser("newcomer");

    const old = await readOnboarding(client, "old-timer");
    expect(old).toEqual({ existingMember: true, hints: {} });
    expect(deckDue(old)).toBe(false);
    expect(hintsDue(old)).toEqual([]);
    expect(await readOnboarding(client, "newcomer")).toBeNull();
    expect(deckDue(null)).toBe(true);
  });
});

describe("onboarding state", () => {
  beforeEach(async () => {
    await client.execute("PRAGMA foreign_keys = ON");
    await runMigrations(client, { logger: QUIET });
    await addUser("anna");
  });

  it("makes the hints due once the tour is answered, in order", async () => {
    expect(hintsDue(await readOnboarding(client, "anna"))).toEqual([]);
    await answerDeck(client, "anna", "skipped", 4);
    const state = await readOnboarding(client, "anna");
    expect(state?.deck).toMatchObject({ outcome: "skipped", reached: 4 });
    expect(deckDue(state)).toBe(false);
    expect(hintsDue(state)).toEqual([
      "calendar-start",
      "calendar-cycle",
      "night-open",
      "night-rsvp",
      "night-vote",
    ]);
  });

  it("keeps the first answer to the tour", async () => {
    await answerDeck(client, "anna", "finished", 9);
    await answerDeck(client, "anna", "skipped", 1);
    expect((await readOnboarding(client, "anna"))?.deck).toMatchObject({ outcome: "finished" });
  });

  it("marks hints seen idempotently, keeping the first time, and never loses the deck", async () => {
    await answerDeck(client, "anna", "finished", 9);
    await markHintSeen(client, "anna", "night-rsvp", new Date("2026-10-09T10:00:00Z"));
    await markHintSeen(client, "anna", "night-rsvp", new Date("2026-10-10T10:00:00Z"));
    await markHintSeen(client, "anna", "calendar-start");
    const state = await readOnboarding(client, "anna");
    expect(state?.hints["night-rsvp"]).toBe("2026-10-09T10:00:00.000Z");
    expect(state?.deck?.outcome).toBe("finished");
    expect(hintsDue(state)).toEqual(["calendar-cycle", "night-open", "night-vote"]);
  });

  it("can record a hint before the tour (a fresh row) without blocking the tour", async () => {
    await markHintSeen(client, "anna", "calendar-start");
    const state = await readOnboarding(client, "anna");
    expect(deckDue(state)).toBe(true);
    await answerDeck(client, "anna", "finished", 9);
    expect(hintsDue(await readOnboarding(client, "anna"))).not.toContain("calendar-start");
  });

  it("treats a corrupt stored value as a fresh state", async () => {
    await client.execute({
      sql: "INSERT INTO user_onboarding (user_id, state_json) VALUES ('anna', 'not json')",
      args: [],
    });
    expect(await readOnboarding(client, "anna")).toEqual({ hints: {} });
  });
});
