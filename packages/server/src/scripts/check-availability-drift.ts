/**
 * Compare the two availability sources. READ-ONLY — issues nothing but SELECTs.
 *
 *   pnpm --filter @boardgames/server exec tsx src/scripts/check-availability-drift.ts
 *   pnpm --filter @boardgames/server exec tsx src/scripts/check-availability-drift.ts --prod
 *
 * Migration 0010 normalized `user_availability` (one JSON blob per member) into
 * `user_availability_days` (one row per member-day) and declared an EXPAND
 * phase whose CONTRACT never happened. For 24 migrations both were live, kept
 * in step only by a dual-write, while different endpoints read different ones.
 *
 * Every read path now uses the normalized table. The blob is still written as a
 * rollback backstop, and dropping it is a separate, irreversible migration.
 * This script is the go/no-go for that migration: run it against PRODUCTION and
 * require a clean result immediately before dropping the table.
 *
 * Exit code 0 = the two sources agree; 1 = they don't (details printed).
 */

// Must be first: populates process.env before the connection config is read.
import "../env.ts";

import { createClient } from "@libsql/client";

type Status = "can" | "maybe";
type DayMap = Map<string, Status>;

const useProd = process.argv.includes("--prod");
const url = useProd ? process.env.PROD_TURSO_DATABASE_URL : process.env.TURSO_DATABASE_URL;
const authToken = useProd ? process.env.PROD_TURSO_AUTH_TOKEN : process.env.TURSO_AUTH_TOKEN;

if (!url) {
  console.error(
    useProd
      ? "PROD_TURSO_DATABASE_URL is required for --prod (see packages/server/.env.example)"
      : "TURSO_DATABASE_URL is required",
  );
  process.exit(1);
}

const db = createClient({ url, authToken });
console.log(
  `[drift] reading ${useProd ? "PRODUCTION" : "the configured database"}: ${new URL(url).host}`,
);

function parseBlob(raw: unknown): DayMap {
  const out: DayMap = new Map();
  if (typeof raw !== "string" || raw.length === 0) return out;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return out;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return out;
  for (const [date, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (value === "can" || value === "maybe") out.set(date, value);
  }
  return out;
}

let failed = false;
try {
  const blobRows = await db.execute("SELECT user_id, availability_json FROM user_availability");
  const dayRows = await db.execute("SELECT user_id, date_key, status FROM user_availability_days");

  const blobByUser = new Map<string, DayMap>();
  for (const r of blobRows.rows) {
    blobByUser.set(String(r.user_id), parseBlob(r.availability_json));
  }
  const daysByUser = new Map<string, DayMap>();
  for (const r of dayRows.rows) {
    const userId = String(r.user_id);
    let entry = daysByUser.get(userId);
    if (!entry) {
      entry = new Map();
      daysByUser.set(userId, entry);
    }
    entry.set(String(r.date_key), String(r.status) as Status);
  }

  const everyUser = new Set([...blobByUser.keys(), ...daysByUser.keys()]);
  console.log(
    `[drift] ${blobByUser.size} blob row(s), ${dayRows.rows.length} day row(s) across ${daysByUser.size} member(s)`,
  );

  const problems: string[] = [];
  for (const userId of [...everyUser].sort()) {
    const blob = blobByUser.get(userId) ?? new Map();
    const days = daysByUser.get(userId) ?? new Map();

    for (const [date, status] of blob) {
      const other = days.get(date);
      if (other === undefined) problems.push(`${userId} ${date}: blob=${status} days=(missing)`);
      else if (other !== status) problems.push(`${userId} ${date}: blob=${status} days=${other}`);
    }
    for (const [date, status] of days) {
      if (!blob.has(date)) problems.push(`${userId} ${date}: blob=(missing) days=${status}`);
    }
  }

  // The blob has no FK to `user`; the normalized table cascades. A blob row for
  // a deleted member is invisible drift that used to keep voting in the
  // next-night calculation.
  const orphans = await db.execute(
    `SELECT user_id FROM user_availability WHERE user_id NOT IN (SELECT id FROM "user")`,
  );
  for (const r of orphans.rows) {
    problems.push(`${String(r.user_id)}: blob row for a member who no longer exists`);
  }

  if (problems.length === 0) {
    console.log("[drift] ✅ the two sources agree exactly — safe to CONTRACT");
  } else {
    failed = true;
    console.error(`[drift] ❌ ${problems.length} disagreement(s):`);
    for (const line of problems.slice(0, 50)) console.error(`  ${line}`);
    if (problems.length > 50) console.error(`  … and ${problems.length - 50} more`);
    console.error(
      "[drift] do NOT drop `user_availability` until this is explained — the blob may hold the only copy of something.",
    );
  }
} catch (err) {
  failed = true;
  console.error("[drift] failed:", err instanceof Error ? err.message : String(err));
} finally {
  db.close();
}

process.exit(failed ? 1 : 0);
