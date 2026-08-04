# Database operations

The production database is **Turso/libsql** (`@libsql/client`). There is no
`better-sqlite3` anywhere in the dependency tree, and no local-file mode: the
server talks to a remote database over the network, always.

## The risk model

Three properties compose into one sharp edge:

1. **Migrations are forward-only by design.** There is intentionally no `down`
   (`migrations/types.ts`); a "rollback" is a new migration.
2. **They apply automatically on deploy.** Railway runs the migrator as a
   `preDeployCommand`, so a failing migration now **aborts the deploy** instead
   of crash-looping the app — but a *successful* migration that does the wrong
   thing is already committed.
3. **The only copy of the data you control is the one you took.**

So: **take a backup before any migration that writes data.** Schema-only
additions (new table, new column, new index) are cheap to fix forward. Anything
with `UPDATE`, `DELETE`, or `DROP` is not.

## Backups

```bash
pnpm --filter @boardgames/server db:backup                 # → ./backups/boardgames-<iso>.sql
pnpm --filter @boardgames/server db:backup -- --out /some/dir
```

A plain-SQL logical dump: schema, then paged `INSERT`s, wrapped in a
transaction with foreign keys deferred so table order can't break the restore.
Restore into a fresh database with the libsql or sqlite shell.

Verify a backup by restoring it — an unverified backup is a guess:

```bash
sqlite3 /tmp/restore-check.db < backups/boardgames-<iso>.sql
sqlite3 /tmp/restore-check.db "PRAGMA foreign_key_check;"   # must print nothing
```

Turso may also have point-in-time recovery enabled on the account. Nothing in
this repo verifies that, so do not rely on it without checking the dashboard.

## Changing the schema

```bash
# 1. Write the migration: packages/server/src/migrations/00NN-<name>.ts
#    Register it in migrations/registry.ts. One statement per array entry.

# 2. Prove it against real data. Read-only: copies prod into :memory:,
#    applies pending migrations with foreign keys ON, diffs foreign_key_check.
pnpm --filter @boardgames/server migrate:dry-run

# 3. Back up if the migration writes data.
pnpm --filter @boardgames/server db:backup

# 4. Open a PR. CI re-runs the dry-run and the migration test suite.

# 5. Merge. Railway's preDeployCommand applies it; a failure aborts the deploy.
```

`pnpm --filter @boardgames/server migrate:status` shows the applied chain.

### Never `DROP TABLE` a table something references

The SQLite table-rebuild dance (`CREATE t_new` → copy → `DROP t` → `RENAME`)
is a **data-loss landmine here**, because every migration is applied as a
single `db.batch(..., "write")` — an implicit transaction — and
`PRAGMA foreign_keys` **cannot be toggled inside a transaction**. The `DROP`
therefore runs with enforcement ON, cascades into every referring table, and
the migration commits successfully with no error.

Migrations 0011–0013 use this pattern and were safe only because nothing
referenced those tables at the time. That is no longer generally true —
`dnd_campaigns` now has five `ON DELETE CASCADE` dependents.

`migrations/drop-table-safety.test.ts` replays the whole chain and fails if any
migration drops a referenced table. If you hit it, don't work around it: add
columns in place, or introduce a new table and migrate readers.

## Local development points at production

`packages/server/.env` sets `NODE_ENV=production` and
`TURSO_DATABASE_URL` to the **live** database. There is no staging database, so
every `pnpm dev`, every ad-hoc script in `src/scripts/`, and any test that
forgets `:memory:` reads and writes production data.

Two consequences worth internalising:

- `migrate:dry-run` exists because there is nowhere else to rehearse.
- `NODE_ENV=production` locally is why the CORS/WebSocket origin allowlist keys
  off *"am I deployed"* (Railway's env vars) rather than `NODE_ENV` — see
  `lib/origins.ts`. Otherwise every developer would be locked out of their own
  dev server.

### Recommended: create a staging database

```bash
turso db create boardgames-staging --from-db boardgames-iceboxdev
turso db tokens create boardgames-staging
```

Point your local `packages/server/.env` at it and set `NODE_ENV=development`.
Keep the production URL only in Railway's environment. This removes the largest
single operational risk in the project — it is not a refactor, it is two
commands and an env edit.

Preview deployments have the same problem from the other direction:
`vercel.json` rewrites `/api/*` to the production Railway URL, so **every
Vercel preview writes to production**. Point previews at a staging backend
before relying on them for anything destructive.

## Schema notes worth knowing

- **`match_participants`** is a materialised index of `extractParticipantIds`.
  `outcome_json` remains the source of truth for who played in a match; the
  table exists so "matches for user X" is an index seek instead of a
  leading-wildcard `LIKE` scan. Both are written in the same batch.
- **`user_availability` vs `user_availability_days`** — migration 0010 declared
  an EXPAND phase with a promised CONTRACT that has not happened. Both are
  live, kept in sync by a dual-write, and **different endpoints read different
  ones** (`next-night.ts` reads the legacy blob; the calendar reads the
  normalized table). Any write that isn't the dual-writing `PUT` desynchronizes
  them silently. Finishing the CONTRACT is outstanding work.
- **JSON stored as TEXT is validated on read**, via `jsonColumn()` /
  `parseRow()` in `lib/db-rows.ts`. Use them; do not hand-roll `JSON.parse` at
  a row boundary.
