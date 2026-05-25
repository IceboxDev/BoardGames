// Dedicated migration command. Run it before starting the server (the server's
// boot only ASSERTS the database is current; it never migrates).
//
//   pnpm --filter @boardgames/server migrate           # apply pending migrations
//   pnpm --filter @boardgames/server migrate:status     # report, change nothing
//
// In production the deploy runs the built form (dist/migrations/cli.js) ahead of
// the server process — see railway.json.

// Must be first: populates process.env from .env(.local) before getDbConnectionConfig reads it.
import "../env.ts";

import { createClient } from "@libsql/client";
import { getDbConnectionConfig } from "../db.ts";
import { __test__, runMigrations } from "./migrator.ts";
import { LATEST_VERSION } from "./registry.ts";

const statusOnly = process.argv.includes("--status");

const { url, authToken } = getDbConnectionConfig();
const db = createClient({ url, authToken });

try {
  if (statusOnly) {
    const { MIGRATIONS_TABLE } = __test__;
    const exists = await db.execute({
      sql: "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
      args: [MIGRATIONS_TABLE],
    });
    if (exists.rows.length === 0) {
      console.log(`[migrate:status] not initialized — "${MIGRATIONS_TABLE}" does not exist`);
      console.log(`[migrate:status] code defines up to v${LATEST_VERSION}`);
    } else {
      const { rows } = await db.execute(
        `SELECT version, name, applied_at FROM ${MIGRATIONS_TABLE} ORDER BY version`,
      );
      console.log(`[migrate:status] applied migrations (${rows.length}):`);
      for (const r of rows) {
        console.log(`  v${r.version}  ${r.name}  @ ${r.applied_at}`);
      }
      const current = rows.length === 0 ? 0 : Number(rows[rows.length - 1].version);
      console.log(
        `[migrate:status] database at v${current}, code at v${LATEST_VERSION}` +
          (current === LATEST_VERSION ? " — up to date" : ` — ${LATEST_VERSION - current} pending`),
      );
    }
  } else {
    const result = await runMigrations(db);
    if (result.stampedBaseline) {
      console.log("[migrate] stamped baseline v1 on existing database");
    }
    if (result.applied.length > 0) {
      console.log(`[migrate] applied v${result.applied.join(", v")} (now at v${result.to})`);
    } else if (!result.stampedBaseline) {
      console.log(`[migrate] nothing to do (at v${result.to})`);
    } else {
      console.log(`[migrate] now at v${result.to}`);
    }
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  db.close();
  process.exit(1);
}

db.close();
process.exit(0);
