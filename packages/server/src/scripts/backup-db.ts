/**
 * Full logical backup of a Turso database to a timestamped `.sql` file.
 *
 * Why this exists: migrations are forward-only BY DESIGN (see
 * migrations/types.ts — a "rollback" is a new migration), and they apply
 * automatically as Railway's pre-deploy step. Turso's point-in-time recovery
 * is the primary net; this is the copy we hold ourselves.
 *
 *   pnpm --filter @boardgames/server db:backup                # staging (the .env target)
 *   pnpm --filter @boardgames/server db:backup -- --prod      # production, via PROD_TURSO_*
 *   pnpm --filter @boardgames/server db:backup -- --prod --verify --encrypt --keep 14
 *   pnpm --filter @boardgames/server db:backup -- --decrypt backups/boardgames-<stamp>.sql.enc
 *
 *   --out DIR     where to write (default: packages/server/backups)
 *   --verify      replay the dump into memory and compare it to the source
 *                 before keeping it; a dump that fails is deleted and the
 *                 command exits non-zero. An unverified backup is a guess.
 *   --encrypt     AES-256-GCM with BACKUP_PASSPHRASE; the plaintext never
 *                 touches disk. Required for any copy that leaves this machine.
 *   --keep N      after writing, delete all but the newest N backups in DIR.
 *   --decrypt F   write the plaintext of an encrypted backup next to it.
 *
 * The dump is one read-transaction snapshot (see lib/backup.ts), so it is
 * consistent across tables even while the server is writing.
 */

import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { createClient } from "@libsql/client";
import "../env.ts";
import { dumpToString, redactSource, verifyDump } from "../lib/backup.ts";
import { BACKUP_ENCRYPTED_EXTENSION, decryptBackup, encryptBackup } from "../lib/backup-crypto.ts";
import { describeDbTarget, resolveDbTarget } from "../lib/db-target.ts";

const FILE_PREFIX = "boardgames-";

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function passphrase(): string {
  const value = process.env.BACKUP_PASSPHRASE?.trim();
  if (!value) throw new Error("BACKUP_PASSPHRASE is required for --encrypt / --decrypt");
  return value;
}

async function prune(outDir: string, keep: number): Promise<string[]> {
  const entries = (await readdir(outDir))
    .filter((f) => f.startsWith(FILE_PREFIX) && (f.endsWith(".sql") || f.endsWith(".sql.enc")))
    .sort();
  const stale = entries.slice(0, Math.max(0, entries.length - keep));
  await Promise.all(stale.map((f) => unlink(resolve(outDir, f))));
  return stale;
}

async function decryptMode(file: string, outDir: string): Promise<void> {
  const plaintext = decryptBackup(await readFile(file), passphrase());
  const outPath = resolve(outDir, basename(file).replace(/\.enc$/, ""));
  await writeFile(outPath, plaintext);
  console.log(`[backup] decrypted → ${outPath}`);
}

async function main(): Promise<void> {
  const outDir = resolve(argValue("--out") ?? "backups");
  await mkdir(outDir, { recursive: true });

  const decryptTarget = argValue("--decrypt");
  if (decryptTarget) return decryptMode(resolve(decryptTarget), outDir);

  // Read-only: the target guard only needs to route --prod to its own pair.
  const target = resolveDbTarget({ argv: process.argv, env: process.env, writes: false });
  console.log(describeDbTarget(target, "backup"));
  const db = createClient({ url: target.url, authToken: target.authToken });

  const encrypt = process.argv.includes("--encrypt");
  const verify = process.argv.includes("--verify");
  const keep = argValue("--keep");
  if (encrypt) passphrase(); // fail before doing the work, not after

  // `new Date()` is fine here: this is a CLI, not a workflow script.
  const takenAt = new Date().toISOString();
  const stamp = takenAt.replace(/[:.]/g, "-");
  const sql = await dumpToString(db, { source: redactSource(target.url), takenAt });
  const tables = (sql.match(/^CREATE TABLE/gm) ?? []).length;
  const rows = (sql.match(/^INSERT INTO/gm) ?? []).length;

  if (verify) {
    const verification = await verifyDump(sql, db);
    if (!verification.ok) {
      db.close();
      console.error("[backup] ❌ the dump does not restore to the source; nothing was written:");
      for (const problem of verification.problems) console.error(`  - ${problem}`);
      process.exit(1);
    }
    console.log("[backup] ✅ verified: the dump restores to an identical database");
  }
  db.close();

  const outPath = resolve(
    outDir,
    `${FILE_PREFIX}${stamp}${encrypt ? BACKUP_ENCRYPTED_EXTENSION : ".sql"}`,
  );
  const payload = Buffer.from(sql, "utf8");
  await writeFile(outPath, encrypt ? encryptBackup(payload, passphrase()) : payload);
  console.log(
    `[backup] ${tables} tables / ${rows} rows → ${outPath}${encrypt ? " (encrypted)" : ""}`,
  );

  if (keep !== undefined) {
    const n = Number(keep);
    if (!Number.isInteger(n) || n < 1) throw new Error("--keep expects a positive integer");
    const removed = await prune(outDir, n);
    if (removed.length > 0) console.log(`[backup] pruned ${removed.length} older backup(s)`);
  }
}

main().catch((err) => {
  console.error("[backup] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
