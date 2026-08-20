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
# Backs up whatever TURSO_DATABASE_URL points at — locally that is STAGING.
pnpm --filter @boardgames/server db:backup

# Backs up PRODUCTION, via the separate PROD_TURSO_* credential pair.
pnpm --filter @boardgames/server db:backup -- --prod

pnpm --filter @boardgames/server db:backup -- --prod --out /some/dir
# → packages/server/backups/boardgames-<iso>.sql
```

A plain-SQL logical dump: schema, then paged `INSERT`s, wrapped in a
transaction with foreign keys deferred so table order can't break the restore.
Restore into a fresh database with the libsql or sqlite shell.

Verify a backup by restoring it — an unverified backup is a guess:

```bash
sqlite3 /tmp/restore-check.db < backups/boardgames-<iso>.sql
sqlite3 /tmp/restore-check.db "PRAGMA foreign_key_check;"   # must print nothing
```

**Point-in-time recovery works** (verified 2026-08-05 on the `starter` plan) —
this is your real safety net for a bad migration:

```bash
turso db create boardgames-recovery --from-db boardgames \
  --timestamp 2026-08-05T20:00:00Z      # RFC3339
```
It restores into a NEW database; inspect it, then copy the good rows back.
Retention on `starter` is short, so it covers "the migration I ran an hour ago",
not "the data we lost last month". Production also has **delete protection**
enabled, so `turso db destroy boardgames` refuses without disabling it first.

**A dump contains personal data** — member emails and the home addresses on
locked nights. `backups/` is gitignored at every depth, and **this repository is
public**, so that ignore rule is the only thing standing between a dump and the
internet. Never commit one, never attach one to an issue, and do not upload one
as a GitHub Actions artifact: artifacts on a public repo are downloadable by
anyone. If you automate backups to CI, encrypt the file before it leaves the
runner.

## Changing the schema

```bash
# 1. Write the migration: packages/server/src/migrations/00NN-<name>.ts
#    Register it in migrations/registry.ts. One statement per array entry.

# 2. Prove it against real data. Read-only: copies the configured database
#    (staging) into :memory:, applies pending migrations with foreign keys ON,
#    and diffs foreign_key_check before/after.
pnpm --filter @boardgames/server migrate:dry-run

# 3. Back up PRODUCTION if the migration writes data — plain `db:backup`
#    would only dump staging.
pnpm --filter @boardgames/server db:backup -- --prod

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

## Local development used to point at production

**Fixed on 2026-08-05** — kept here because it shaped the tooling.
`packages/server/.env` used to set `NODE_ENV=production` with
`TURSO_DATABASE_URL` pointing at the **live** database, so every `pnpm dev`,
every ad-hoc script in `src/scripts/`, and any test that forgot `:memory:` read
and wrote production data. It now points at staging (see below).

Two consequences that outlived it:

- `migrate:dry-run` was built because there was nowhere else to rehearse. It is
  still the fastest check, and now runs against staging rather than production.
- `NODE_ENV=production` was locally set, which is why the CORS/WebSocket origin allowlist keys
  off *"am I deployed"* (Railway's env vars) rather than `NODE_ENV` — see
  `lib/origins.ts`. Otherwise every developer would be locked out of their own
  dev server.

### The staging database

**This is set up** (2026-08-05). `packages/server/.env` points at
`boardgames-staging` with `NODE_ENV=development`; production lives only in
Railway's environment and in the `PROD_TURSO_*` pair used by `--prod` backups.
The previous production-pointing file is kept at `.env.prod-backup`.

Staging is a disposable full copy. Refresh it whenever it drifts:

```bash
turso db destroy boardgames-staging
turso db create boardgames-staging --from-db boardgames
turso db tokens create boardgames-staging   # paste into TURSO_AUTH_TOKEN
```

Note the database is named `boardgames`; `boardgames-iceboxdev` is only the
URL host.

Preview deployments have the same problem from the other direction:
`vercel.json` rewrites `/api/*` to the production Railway URL, so **every
Vercel preview writes to production**. Point previews at a staging backend
before relying on them for anything destructive.

## Schema notes worth knowing

- **`match_participants`** is a materialised index of `extractParticipantIds`.
  `outcome_json` remains the source of truth for who played in a match; the
  table exists so "matches for user X" is an index seek instead of a
  leading-wildcard `LIKE` scan. Both are written in the same batch.
- **`user_availability` vs `user_availability_days`** — migration 0010's EXPAND
  phase. **Every read now goes through the normalized table**; the last three
  legacy-blob readers (the calendar heat map, the next-night banner, both admin
  coverage views) were repointed alongside migration 0035. The blob is still
  written by `PUT /api/user/availability` as a rollback backstop, so reverting
  the read paths stays a code-only change.
  **The CONTRACT — `DROP TABLE user_availability` — is still outstanding and
  must be its own deploy.** Gate it on a clean run of
  `pnpm --filter @boardgames/server exec tsx src/scripts/check-availability-drift.ts --prod`
  (read-only; compares the two sources row by row and exits non-zero on any
  disagreement), taken immediately before the drop, plus a `db:backup --prod`.
- **`locked_dates.unlocked_at` (migration 0035)** — unlocking a night is a MARK,
  not a delete. It used to `DELETE FROM locked_dates`, which cascaded through
  `rsvps`, `game_requests` and `exit_game_votes` and permanently erased who had
  committed to a night and every vote cast for it — silently rewriting
  `nights-attended` for everyone, with no way back. Every read that means "is
  this night on?" filters `unlocked_at IS NULL`; `POST /lock` clears the mark,
  so re-locking restores the night whole.
  **If you add a query against `locked_dates`, it almost certainly needs that
  filter.** The one deliberate exception is the re-lock read in
  `calendar-locks.ts`, which must see a marked row to revive it (commented in
  place). `auth-routes/calendar-unlock.test.ts` asserts an unlocked night stays
  invisible to each live query shape.
- **JSON stored as TEXT is validated on read**, via `jsonColumn()` /
  `parseRow()` in `lib/db-rows.ts`. Use them; do not hand-roll `JSON.parse` at
  a row boundary.
- **Foreign keys are asserted at boot.** `initDb()` refuses to start unless
  `PRAGMA foreign_keys` reads 1 (`db.ts`). Turso enforces it server-side, but
  every cascade in this schema is the delete mechanism for something, so the
  guarantee is checked rather than assumed — a restore or a platform change that
  silently turned it off would otherwise leave orphans accumulating unnoticed.
