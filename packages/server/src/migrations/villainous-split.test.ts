// Proves the reclassification contract of migration 0022: Villainous history
// recorded under the old single-game model (edition in `outcome.scenario`) is
// re-tagged onto the right box, and the now-redundant scenario label is
// stripped. Seeds legacy-shaped rows on a fully migrated in-memory DB, then
// replays the migration's own statements against them.

import { type Client, createClient } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { villainousSplit } from "./0022-villainous-split.ts";
import { runMigrations } from "./migrator.ts";

const INSERT = `INSERT INTO match_results
    (id, date_key, played_at, game_slug, game_title, outcome_json, recorded_by, recorded_at, sort_order)
  VALUES (?, NULL, '2026-01-01T18:00:00.000Z', ?, 'Villainous', ?, 'u1', datetime('now'), 0)`;

function outcome(scenario: string | null) {
  return JSON.stringify({
    kind: "free-for-all",
    ...(scenario === null ? {} : { scenario }),
    players: [
      { userId: "u1", displayName: "U1", score: 0, rank: 1, role: "Ursula" },
      { userId: "u2", displayName: "U2", score: 0, role: "Maleficent" },
    ],
  });
}

async function applyMigration(db: Client): Promise<void> {
  await db.batch([...villainousSplit.statements], "write");
}

async function readMatch(db: Client, id: number) {
  const { rows } = await db.execute({
    sql: "SELECT game_slug, outcome_json FROM match_results WHERE id = ?",
    args: [id],
  });
  const parsed = JSON.parse(String(rows[0].outcome_json));
  return { slug: String(rows[0].game_slug), outcome: parsed };
}

describe("migration 0022 — villainous split", () => {
  let db: Client;

  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await db.execute("PRAGMA foreign_keys = ON");
    await runMigrations(db);
    await db.batch(
      [
        { sql: INSERT, args: [1, "villainous", outcome("Introduction to Evil")] },
        { sql: INSERT, args: [2, "villainous", outcome("The Worst Takes It All")] },
        { sql: INSERT, args: [3, "villainous", outcome(null)] },
        { sql: INSERT, args: [4, "lovecraft-letter", outcome("Introduction to Evil")] },
      ],
      "write",
    );
  });

  afterEach(() => {
    db.close();
  });

  it("moves a starter-edition match onto the starter box and drops the label", async () => {
    await applyMigration(db);
    const m = await readMatch(db, 1);
    expect(m.slug).toBe("villainous-introduction-to-evil");
    expect(m.outcome.scenario).toBeUndefined();
  });

  it("keeps a base-edition match on `villainous` and drops the label", async () => {
    await applyMigration(db);
    const m = await readMatch(db, 2);
    expect(m.slug).toBe("villainous");
    expect(m.outcome.scenario).toBeUndefined();
  });

  it("preserves players, roles and the winner while rewriting the row", async () => {
    await applyMigration(db);
    const m = await readMatch(db, 1);
    expect(m.outcome.kind).toBe("free-for-all");
    expect(m.outcome.players).toHaveLength(2);
    expect(m.outcome.players[0]).toMatchObject({ userId: "u1", rank: 1, role: "Ursula" });
    expect(m.outcome.players[1]).toMatchObject({ userId: "u2", role: "Maleficent" });
  });

  it("leaves a scenario-less villainous match untouched", async () => {
    await applyMigration(db);
    const m = await readMatch(db, 3);
    expect(m.slug).toBe("villainous");
    expect(m.outcome.scenario).toBeUndefined();
  });

  it("never touches another game that happens to share the scenario string", async () => {
    await applyMigration(db);
    const m = await readMatch(db, 4);
    expect(m.slug).toBe("lovecraft-letter");
    expect(m.outcome.scenario).toBe("Introduction to Evil");
  });

  it("is idempotent — replaying it changes nothing", async () => {
    await applyMigration(db);
    await applyMigration(db);
    expect((await readMatch(db, 1)).slug).toBe("villainous-introduction-to-evil");
    expect((await readMatch(db, 2)).slug).toBe("villainous");
    const { rows } = await db.execute("SELECT COUNT(*) n FROM match_results");
    expect(Number(rows[0].n)).toBe(4);
  });
});
