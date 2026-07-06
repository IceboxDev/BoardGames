import { type Client, createClient } from "@libsql/client";
import { assertAtLatestVersion } from "./migrations/migrator.ts";

let db: Client | null = null;

// Any query slower than this (ms) is logged. Override with SLOW_QUERY_MS. This
// is the only DB observability we have on a single-process server that also
// runs blocking AI on the main thread — without it, a slow request is
// indistinguishable from the event loop being pinned by an ISMCTS search.
const SLOW_QUERY_MS = Number(process.env.SLOW_QUERY_MS ?? 200);

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

export function getDbConnectionConfig(): { url: string; authToken: string | undefined } {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) {
    throw new Error("TURSO_DATABASE_URL is required. Set it in packages/server/.env");
  }
  const authToken = process.env.TURSO_AUTH_TOKEN;
  return { url, authToken };
}

/**
 * Open the database client and verify the schema is current. Migrations are NOT
 * run here — that is the dedicated `migrate` command's job (src/migrations/cli.ts).
 * Boot fails fast with an actionable message if the database isn't at the latest
 * version, so we never serve traffic against a stale or partially-migrated schema.
 */
export async function initDb(): Promise<Client> {
  const { url, authToken } = getDbConnectionConfig();
  db = withTiming(createClient({ url, authToken }));
  await assertAtLatestVersion(db);
  return db;
}
