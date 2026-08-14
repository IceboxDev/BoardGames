/**
 * Full logical backup of the Turso database to a timestamped `.sql` file.
 *
 * Why this exists: migrations are forward-only BY DESIGN (see
 * migrations/types.ts — a "rollback" is a new migration), and they apply
 * automatically as Railway's pre-deploy step. Without a restorable copy, one
 * bad `UPDATE` in a migration is permanent. Turso's own point-in-time recovery
 * may also be enabled on the account, but nothing in this repo verified it, so
 * this is the copy we control.
 *
 *   pnpm --filter @boardgames/server db:backup
 *   pnpm --filter @boardgames/server db:backup -- --out /path/to/dir
 *
 * Output is plain SQL: schema first, then INSERTs, wrapped in a transaction
 * with foreign keys deferred so table order can't break the restore. Restore
 * into a fresh database with the libsql/sqlite shell.
 *
 * This is a point-in-time logical dump, not a consistent snapshot across a
 * running write load — take it before a migration, not during peak traffic.
 */

import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@libsql/client";
import "../env.ts";

const PAGE_SIZE = 500;

function quote(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "bigint") return String(value);
  if (value instanceof ArrayBuffer) {
    return `X'${Buffer.from(value).toString("hex")}'`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  // Local development points at STAGING, so "back up the database in .env"
  // would dump a throwaway copy — precisely the backup you don't need. `--prod`
  // targets production explicitly via its own credential pair, so the thing
  // worth protecting is never backed up by accident or by default.
  const useProd = process.argv.includes("--prod");
  const url = useProd ? process.env.PROD_TURSO_DATABASE_URL : process.env.TURSO_DATABASE_URL;
  const authToken = useProd ? process.env.PROD_TURSO_AUTH_TOKEN : process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    throw new Error(
      useProd
        ? "PROD_TURSO_DATABASE_URL is required for --prod (see packages/server/.env.example)"
        : "TURSO_DATABASE_URL is required",
    );
  }
  console.log(`Backing up ${useProd ? "PRODUCTION" : "the configured database"}: ${url}`);

  const db = createClient({ url, authToken });

  const outDir = resolve(argValue("--out") ?? "backups");
  await mkdir(outDir, { recursive: true });

  // `new Date()` is fine here: this is a CLI, not a workflow script.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = resolve(outDir, `boardgames-${stamp}.sql`);
  const out = createWriteStream(outPath, { encoding: "utf8" });
  const write = (line: string) => out.write(`${line}\n`);

  write(`-- boardgames logical backup`);
  write(`-- source: ${url.replace(/\?.*$/, "")}`);
  write(`-- taken:  ${stamp}`);
  write("PRAGMA foreign_keys = OFF;");
  write("BEGIN TRANSACTION;");

  const objects = await db.execute(
    `SELECT type, name, sql FROM sqlite_master
      WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
      ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END, name`,
  );

  const tables: string[] = [];
  for (const row of objects.rows) {
    write(`${String(row.sql)};`);
    if (String(row.type) === "table") tables.push(String(row.name));
  }

  let totalRows = 0;
  for (const table of tables) {
    const { rows: countRows } = await db.execute(`SELECT COUNT(*) AS n FROM "${table}"`);
    const count = Number(countRows[0]?.n ?? 0);
    if (count === 0) continue;

    write(`-- ${table} (${count} rows)`);
    // Paged so a large table never has to be materialised in one response.
    for (let offset = 0; offset < count; offset += PAGE_SIZE) {
      const page = await db.execute({
        sql: `SELECT * FROM "${table}" LIMIT ? OFFSET ?`,
        args: [PAGE_SIZE, offset],
      });
      for (const row of page.rows) {
        const columns = Object.keys(row);
        const values = columns.map((c) => quote((row as Record<string, unknown>)[c]));
        write(
          `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(", ")}) VALUES (${values.join(", ")});`,
        );
      }
    }
    totalRows += count;
  }

  write("COMMIT;");
  write("PRAGMA foreign_keys = ON;");

  await new Promise<void>((done, fail) => {
    out.end(() => done());
    out.on("error", fail);
  });

  console.log(`Backed up ${tables.length} tables / ${totalRows} rows → ${outPath}`);
}

main().catch((err) => {
  console.error("[backup] failed:", err);
  process.exit(1);
});
