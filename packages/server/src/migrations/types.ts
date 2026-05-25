// A single forward-only schema migration.
//
// Migrations are immutable once they ship: the runner records a checksum of
// `statements` in `schema_migrations` and refuses to start if a previously
// applied migration's definition has changed (see migrator.ts). To change the
// schema you ALWAYS add a new migration with the next version — you never edit
// an old one.

export interface Migration {
  /**
   * Ascending, contiguous version starting at 1 (1, 2, 3, …). The registry
   * validates this at module load; a gap or duplicate is a build-time throw.
   */
  readonly version: number;

  /**
   * Stable, human-readable label (snake_case). Recorded in the DB next to the
   * version. Never change it after the migration has shipped — the runner
   * treats a name change on an applied migration as drift and refuses to run.
   */
  readonly name: string;

  /**
   * Forward SQL, in order. Each entry MUST be exactly ONE statement — libsql's
   * `batch` rejects multi-statement strings. The whole array is applied as a
   * single atomic `batch(..., "write")` TOGETHER with the bookkeeping row that
   * records the migration, so the migration and its record commit or roll back
   * as one unit. There is intentionally no `down`: forward-only is the only
   * safe model against a production database (a "rollback" is a new migration).
   */
  readonly statements: readonly string[];
}
