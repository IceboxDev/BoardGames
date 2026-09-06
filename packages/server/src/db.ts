import { type Client, createClient } from "@libsql/client";
import { assertAtLatestVersion } from "./migrations/migrator.ts";

let db: Client | null = null;

// Any query slower than this (ms) is logged. Override with SLOW_QUERY_MS. This
// is the only DB observability we have on a single-process server that also
// runs blocking AI on the main thread — without it, a slow request is
// indistinguishable from the event loop being pinned by an ISMCTS search.
//
// The default must sit ABOVE Turso's idle-reconnect band: the starter-tier
// database tears down connection state after ~5-15s of idle, and the next
// query pays 200-450ms to re-establish it (measured 2026-09-03, identical
// over ws and http transports — it's server-side, not ours). Sporadic
// traffic like the iCal feed pollers pays that on every hit, so a threshold
// inside the band logs the deployment's steady state, not a problem.
const SLOW_QUERY_MS = Number(process.env.SLOW_QUERY_MS ?? 500);

/** One-line, log-safe description of a statement (SQL only — never bound args,
 *  which can contain user data). Accepts a string or a `{ sql }` object. */
function describeStatement(stmt: unknown): string {
  const sql = typeof stmt === "string" ? stmt : ((stmt as { sql?: string })?.sql ?? "");
  return sql.replace(/\s+/g, " ").trim().slice(0, 160);
}

/** Wrap a libsql client so `execute`/`batch` are timed and slow calls are
 *  logged. Everything else passes straight through (bound to the real client so
 *  internal `this` stays correct). Still a `Client` to callers.
 *
 *  Uses an apply-trap Proxy per method so libsql's overloaded signatures don't
 *  need to be re-typed here. */
function withTiming(client: Client): Client {
  const timeCalls = (
    method: (...args: never[]) => Promise<unknown>,
    label: string,
    describe: (args: unknown[]) => string,
  ) =>
    new Proxy(method, {
      apply(target, thisArg, argArray: unknown[]) {
        const startedAt = Date.now();
        const out = Reflect.apply(target, thisArg, argArray) as Promise<unknown>;
        return out.finally(() => {
          const ms = Date.now() - startedAt;
          if (ms >= SLOW_QUERY_MS) {
            console.warn(`[db] slow ${label} ${ms}ms: ${describe(argArray)}`);
          }
        });
      },
    });

  const asLoose = (fn: unknown) => fn as (...args: never[]) => Promise<unknown>;

  const execute = timeCalls(asLoose(client.execute.bind(client)), "execute", (a) =>
    describeStatement(a[0]),
  );
  const batch = timeCalls(asLoose(client.batch.bind(client)), "batch", (a) => {
    const stmts = (a[0] as unknown[]) ?? [];
    const head = stmts.slice(0, 3).map(describeStatement).join(" | ");
    return `${stmts.length} stmts [${head}${stmts.length > 3 ? " | …" : ""}]`;
  });

  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === "execute") return execute;
      if (prop === "batch") return batch;
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

export function getDb(): Client {
  if (!db) {
    throw new Error("Database not initialized. Call initDb() first.");
  }
  return db;
}

export interface DbConnectionConfig {
  readonly url: string;
  readonly authToken: string | undefined;
}

export function getDbConnectionConfig(): DbConnectionConfig {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) {
    throw new Error("TURSO_DATABASE_URL is required. Set it in packages/server/.env");
  }
  const authToken = process.env.TURSO_AUTH_TOKEN;
  return { url, authToken };
}

/** How long `/api/health` waits for the database before reporting it down. */
const PROBE_TIMEOUT_MS = Number(process.env.DB_PROBE_TIMEOUT_MS ?? 2_000);

export type DbProbe =
  | { readonly ok: true; readonly ms: number }
  | { readonly ok: false; readonly ms: number; readonly error: string };

/**
 * One cheap round trip, bounded by a deadline. The boot-time checks in
 * `initDb` run once; a database that dies afterwards would otherwise leave
 * the process answering "healthy" while every request fails. The healthcheck
 * calls this so the orchestrator restarts (or pages) instead.
 */
export async function probeDb(client: Client = getDb()): Promise<DbProbe> {
  const startedAt = Date.now();
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`no response within ${PROBE_TIMEOUT_MS}ms`)),
      PROBE_TIMEOUT_MS,
    );
  });
  try {
    await Promise.race([client.execute("SELECT 1"), deadline]);
    return { ok: true, ms: Date.now() - startedAt };
  } catch (err) {
    // Some transport errors carry an empty message; the reason must never be
    // blank in a health payload.
    const reason = err instanceof Error ? err.message || err.name : String(err);
    return { ok: false, ms: Date.now() - startedAt, error: reason || "unknown error" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Refuse to serve traffic unless the connection enforces foreign keys.
 *
 * Every cascade in the schema is load-bearing, not decorative: deleting a user
 * is how their rsvps, votes, availability, inventory, profile and participant
 * index are removed (migrations 0011-0013, 0024, 0029-0030, 0034), and
 * `admin-match-history.ts` names `ON DELETE CASCADE` as the mechanism that
 * keeps the participant index honest. SQLite defaults this pragma to OFF per
 * connection; Turso turns it on server-side (verified `= 1` on the live
 * databases), which is exactly the kind of ambient guarantee that disappears
 * silently under a platform change, a self-hosted sqld, or a restore from a
 * dump — leaving every cascade a no-op and orphans accumulating with no signal.
 *
 * Checking costs one round trip at boot. Not checking costs a data-integrity
 * incident nobody notices for months.
 */
async function assertForeignKeysEnforced(client: Client): Promise<void> {
  const { rows } = await client.execute("PRAGMA foreign_keys");
  // libsql reports the pragma as a single row/column; be liberal about which.
  const raw = rows[0] === undefined ? undefined : Object.values(rows[0])[0];
  if (Number(raw) === 1) return;
  throw new Error(
    `[db] refusing to start: PRAGMA foreign_keys is ${raw === undefined ? "unavailable" : String(raw)}, expected 1. ` +
      "Every ON DELETE CASCADE in this schema would silently become a no-op — deleting a user would leave " +
      "their rsvps, votes, availability, inventory, profile and match_participants rows behind as orphans. " +
      "Enable foreign-key enforcement on the database before serving traffic.",
  );
}

/**
 * Open the database client and verify the schema is current. Migrations are NOT
 * run here — that is the dedicated `migrate` command's job (src/migrations/cli.ts).
 * Boot fails fast with an actionable message if the database isn't at the latest
 * version, so we never serve traffic against a stale or partially-migrated schema.
 *
 * `config` defaults to the environment; scripts pass the target that
 * `lib/db-target.ts` resolved so the guard there decides what they connect to.
 */
export async function initDb(
  config: DbConnectionConfig = getDbConnectionConfig(),
): Promise<Client> {
  const { url, authToken } = config;
  db = withTiming(createClient({ url, authToken }));
  await assertAtLatestVersion(db);
  await assertForeignKeysEnforced(db);
  return db;
}

// Exported for tests.
export const __test__ = { assertForeignKeysEnforced };
