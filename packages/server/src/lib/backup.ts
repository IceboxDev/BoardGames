// Logical backup: a plain-SQL dump that a fresh libsql / sqlite database can
// replay, plus the round-trip check that proves a given dump restores to the
// data it was taken from.
//
// Properties the CLI and the scheduled job rely on:
//
//   • CONSISTENT. Against a remote database every read runs inside one read
//     transaction, so the dump is a single snapshot even under concurrent
//     writes. (A local file / in-memory client is a single connection with
//     no other writer; the libsql local driver moves that connection INTO a
//     transaction and leaves the client empty afterwards, so there the reads
//     run directly on the client.)
//   • DETERMINISTIC. Rows are emitted in `rowid` order, so two dumps of the
//     same data are byte-identical below the header — which is what makes
//     `verifyDump` a full-content comparison rather than a row count.
//   • RESTORABLE AS-IS. Schema first (tables, then indexes), then INSERTs,
//     wrapped in a transaction with foreign keys off, so table order cannot
//     break a restore. `PRAGMA foreign_key_check` after a restore must be
//     empty; `verifyDump` asserts that too.

import { type Client, createClient, type Transaction } from "@libsql/client";

const PAGE_SIZE = 500;

/** Lines that describe the dump, not the data; ignored by comparisons. */
const HEADER_LINES = 3;

export interface DumpMeta {
  /** Where the data came from; secrets are stripped from URLs. */
  readonly source: string;
  /** ISO timestamp the dump was taken. */
  readonly takenAt: string;
}

export interface DumpStats {
  readonly tables: number;
  readonly rows: number;
}

/** SQL literal for one cell. libsql hands back strings, numbers, bigints,
 *  nulls and ArrayBuffers (blobs). */
export function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "bigint") return String(value);
  if (value instanceof ArrayBuffer) return `X'${Buffer.from(value).toString("hex")}'`;
  if (ArrayBuffer.isView(value)) {
    return `X'${Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString("hex")}'`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** `libsql://host?authToken=…` → `libsql://host`. */
export function redactSource(url: string): string {
  return url.replace(/\?.*$/, "");
}

/**
 * Stream the dump, line by line, into `sink`. Returns what was dumped.
 * Runs entirely inside one read transaction on `client`.
 */
export async function writeLogicalDump(
  client: Client,
  sink: (line: string) => void,
  meta: DumpMeta,
): Promise<DumpStats> {
  sink("-- boardgames logical backup");
  sink(`-- source: ${meta.source}`);
  sink(`-- taken:  ${meta.takenAt}`);
  sink("PRAGMA foreign_keys = OFF;");
  sink("BEGIN TRANSACTION;");

  const isRemote = client.protocol !== "file";
  const tx = isRemote ? await client.transaction("read") : client;
  let tables = 0;
  let rows = 0;
  try {
    const objects = await tx.execute(
      `SELECT type, name, sql FROM sqlite_master
        WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
        ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END, name`,
    );
    const tableNames: string[] = [];
    for (const row of objects.rows) {
      sink(`${String(row.sql)};`);
      if (String(row.type) === "table") tableNames.push(String(row.name));
    }
    tables = tableNames.length;

    for (const table of tableNames) {
      const count = await tx.execute(`SELECT COUNT(*) AS n FROM "${table}"`);
      const total = Number(count.rows[0]?.n ?? 0);
      if (total === 0) continue;
      sink(`-- ${table} (${total} rows)`);
      // Keyset paging on rowid: stable inside the snapshot and O(n) overall.
      let lastRowid = -1;
      for (;;) {
        const page = await tx.execute({
          sql: `SELECT rowid AS __rowid, * FROM "${table}" WHERE rowid > ? ORDER BY rowid LIMIT ?`,
          args: [lastRowid, PAGE_SIZE],
        });
        if (page.rows.length === 0) break;
        for (const row of page.rows) {
          const record = row as Record<string, unknown>;
          lastRowid = Number(record.__rowid);
          const columns = Object.keys(record).filter((c) => c !== "__rowid");
          sink(
            `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(", ")}) VALUES (${columns
              .map((c) => sqlLiteral(record[c]))
              .join(", ")});`,
          );
          rows += 1;
        }
        if (page.rows.length < PAGE_SIZE) break;
      }
    }
  } finally {
    if (isRemote) await (tx as Transaction).close();
  }

  sink("COMMIT;");
  sink("PRAGMA foreign_keys = ON;");
  return { tables, rows };
}

/** The whole dump as one string (small databases, tests, verification). */
export async function dumpToString(client: Client, meta: DumpMeta): Promise<string> {
  const lines: string[] = [];
  await writeLogicalDump(client, (line) => lines.push(line), meta);
  return `${lines.join("\n")}\n`;
}

/** Replay a dump into a brand-new in-memory database. */
export async function restoreDump(sql: string): Promise<Client> {
  const client = createClient({ url: ":memory:" });
  await client.executeMultiple(sql);
  await client.execute("PRAGMA foreign_keys = ON");
  return client;
}

export interface DumpVerification {
  readonly ok: boolean;
  readonly problems: readonly string[];
}

/**
 * Prove `sql` restores to exactly the data in `source`: replay it into a
 * fresh database, check referential integrity there, then dump THAT database
 * and compare the two dumps line for line below the header. Any difference
 * in schema or content is reported by line.
 */
export async function verifyDump(sql: string, source: Client): Promise<DumpVerification> {
  const problems: string[] = [];
  const restored = await restoreDump(sql);
  try {
    const { rows: violations } = await restored.execute("PRAGMA foreign_key_check");
    if (violations.length > 0) {
      problems.push(`restored database has ${violations.length} foreign-key violation(s)`);
    }
    const meta: DumpMeta = { source: "verify", takenAt: "verify" };
    const [again, original] = await Promise.all([
      dumpToString(restored, meta),
      dumpToString(source, meta),
    ]);
    const a = again.split("\n").slice(HEADER_LINES);
    const b = original.split("\n").slice(HEADER_LINES);
    if (a.length !== b.length) {
      problems.push(`restored dump has ${a.length} lines, source has ${b.length}`);
    }
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] !== b[i]) {
        problems.push(`first difference at line ${i + HEADER_LINES + 1}: ${b[i]?.slice(0, 120)}`);
        break;
      }
    }
  } finally {
    restored.close();
  }
  return { ok: problems.length === 0, problems };
}
