// Migration rehearsal against a REAL database snapshot.
//
//   pnpm --filter @boardgames/server migrate:dry-run
//   pnpm --filter @boardgames/server migrate:dry-run -- --prod      # read prod via PROD_TURSO_*
//   pnpm --filter @boardgames/server migrate:dry-run -- --allow-row-loss
//
// Copies the target database (SELECT/PRAGMA reads ONLY — it never writes to
// the source) into a throwaway in-memory DB, applies the pending migrations
// there with foreign keys ON, and fails when any of these hold:
//
//   • a migration failed to apply on real data;
//   • a table LOST rows (unless --allow-row-loss, for a migration whose job
//     is deleting orphans — say so in its header);
//   • a foreign-key violation was INTRODUCED (compared by identity, so a fix
//     and a regression cannot cancel out);
//   • the migrated snapshot's structure differs from a database migrated
//     from empty (columns, constraints, foreign keys, indexes) — a drifted
//     production schema is a failed rehearsal, not a warning.
//
// Locally the source is STAGING (the .env target), a copy of whatever date
// it was last refreshed. `--prod` reads production through the read-only
// backup credential pair for a rehearsal against current rows. CI does not
// run this (no database credentials) — see .github/workflows/ci.yml.

// Must be first: populates process.env before the target is resolved.
import "../env.ts";

import { createClient } from "@libsql/client";
import { describeDbTarget, resolveDbTarget } from "../lib/db-target.ts";
import { LATEST_VERSION, rehearse, snapshotInto } from "./rehearsal.ts";

const target = resolveDbTarget({ argv: process.argv, env: process.env, writes: false });
console.log(describeDbTarget(target, "migration rehearsal (read-only source)"));
const allowRowLoss = process.argv.includes("--allow-row-loss");

const source = createClient({ url: target.url, authToken: target.authToken });
const snapshot = createClient({ url: ":memory:" });

let failed = false;
try {
  const loaded = await snapshotInto(source, snapshot, {
    info: (message) => console.log(`[dry-run]   ${message}`),
  });
  console.log(`[dry-run] snapshot loaded: ${loaded.rows} rows across ${loaded.tables} tables`);

  const report = await rehearse(snapshot);
  console.log(
    `[dry-run] snapshot was at v${report.from}; this build defines up to v${LATEST_VERSION}`,
  );
  const appliedLabel = report.applied.length > 0 ? `v${report.applied.join(", v")}` : "none";
  console.log(
    `[dry-run] applied ${appliedLabel} in ${report.elapsedMs}ms — snapshot now at v${report.to}`,
  );

  if (report.preExistingViolations.length > 0) {
    console.warn(
      `[dry-run] ⚠ snapshot ALREADY had ${report.preExistingViolations.length} FK violation(s) before migrating (pre-existing data issue):`,
    );
    for (const v of report.preExistingViolations.slice(0, 20)) console.warn(`  - ${v}`);
  }
  if (report.introducedViolations.length > 0) {
    failed = true;
    console.error(
      `[dry-run] ❌ migration would INTRODUCE ${report.introducedViolations.length} foreign-key violation(s):`,
    );
    for (const v of report.introducedViolations.slice(0, 20)) console.error(`  - ${v}`);
  }
  if (report.rowLoss.length > 0) {
    const lines = report.rowLoss.map((r) => `  - ${r.table}: ${r.before} → ${r.after}`);
    if (allowRowLoss) {
      console.warn("[dry-run] ⚠ rows were deleted (allowed by --allow-row-loss):");
      for (const line of lines) console.warn(line);
    } else {
      failed = true;
      console.error("[dry-run] ❌ migration DELETES rows (pass --allow-row-loss if intended):");
      for (const line of lines) console.error(line);
    }
  }
  if (report.schemaDrift.length > 0) {
    failed = true;
    console.error(
      "[dry-run] ❌ the migrated snapshot does not match a database migrated from empty:",
    );
    for (const line of report.schemaDrift) console.error(`  - ${line}`);
  }
  if (!failed) {
    console.log(
      "[dry-run] ✅ no row loss, no new foreign-key violations, structure matches a fresh database",
    );
  }
} catch (err) {
  failed = true;
  console.error("[dry-run] ❌ migration failed against the snapshot:");
  console.error(err instanceof Error ? err.message : String(err));
} finally {
  source.close();
  snapshot.close();
}

process.exit(failed ? 1 : 0);
