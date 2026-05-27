// The ordered list of every migration, ever. Append-only.
//
// To change the schema: create `NNNN-name.ts` exporting a `Migration` with the
// next version, then append it here. Never edit or reorder a migration that has
// shipped — the runner records each migration's checksum and refuses to start
// if an applied migration's definition changed.

import { baseline } from "./0001-baseline.ts";
import { dropTestDummy } from "./0002-drop-test-dummy.ts";
import { onlineMode } from "./0003-online-mode.ts";
import type { Migration } from "./types.ts";

export const migrations: readonly Migration[] = [baseline, dropTestDummy, onlineMode];

/**
 * Fail loudly at module load if the registry is malformed. These invariants are
 * what the runner relies on: versions start at 1, are contiguous and ascending,
 * names are unique, and every statement is a single non-empty SQL statement
 * (libsql `batch` rejects multi-statement strings).
 */
function validateRegistry(list: readonly Migration[]): void {
  const seenVersions = new Set<number>();
  const seenNames = new Set<string>();

  list.forEach((m, i) => {
    const expected = i + 1;
    if (m.version !== expected) {
      throw new Error(
        `migrations registry: entry at index ${i} has version ${m.version}, expected ${expected} (versions must start at 1 and be contiguous & ascending)`,
      );
    }
    if (seenVersions.has(m.version)) {
      throw new Error(`migrations registry: duplicate version ${m.version}`);
    }
    seenVersions.add(m.version);

    if (!m.name.trim()) {
      throw new Error(`migrations registry: version ${m.version} has an empty name`);
    }
    if (seenNames.has(m.name)) {
      throw new Error(`migrations registry: duplicate name "${m.name}"`);
    }
    seenNames.add(m.name);

    if (m.statements.length === 0) {
      throw new Error(`migrations registry: version ${m.version} (${m.name}) has no statements`);
    }
    m.statements.forEach((sql, j) => {
      const trimmed = sql.trim().replace(/;+\s*$/, "");
      if (!trimmed) {
        throw new Error(
          `migrations registry: version ${m.version} (${m.name}) statement ${j} is empty`,
        );
      }
      if (trimmed.includes(";")) {
        throw new Error(
          `migrations registry: version ${m.version} (${m.name}) statement ${j} contains multiple statements (a ';'). Split it into separate array entries.`,
        );
      }
    });
  });
}

validateRegistry(migrations);

export const LATEST_VERSION = migrations.length;
