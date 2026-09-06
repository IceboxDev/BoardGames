// Which database a script talks to — resolved in ONE place, announced before
// any query, and guarded so a script that writes cannot reach production by
// accident.
//
// The convention this enforces: `TURSO_DATABASE_URL` in `.env` is a STAGING
// copy (its host contains "-staging"); production lives only in the
// `PROD_TURSO_*` pair and is reached by passing `--prod` explicitly. That
// convention used to live in a gitignored file and a doc. Now it lives here:
//
//   • no `--prod`            → the `TURSO_*` pair. A script that WRITES is
//                              refused unless that host is a staging database.
//   • `--prod`               → the `PROD_TURSO_*` pair, with a loud banner.
//   • `--unsafe-target`      → skips the staging check for a non-prod host
//                              (local files, `:memory:`). Never needed on a
//                              developer machine that follows the convention.
//
// `resolveDbTarget` is pure (argv + env in, target out) so the rules are
// unit-tested; `connectDbTarget` applies them and opens the connection.

import { initDb } from "../db.ts";

export type DbTargetKind = "production" | "staging" | "other";

export interface DbTarget {
  readonly url: string;
  readonly authToken: string | undefined;
  /** Host part of the URL, or the URL itself for file / memory databases. */
  readonly host: string;
  readonly kind: DbTargetKind;
}

export interface ResolveDbTargetOptions {
  readonly argv: readonly string[];
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Whether the caller will issue INSERT/UPDATE/DELETE. Gates the staging check. */
  readonly writes: boolean;
}

const STAGING_MARKER = "-staging";

function hostOf(url: string): string {
  if (!url.includes("://")) return url;
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

export function resolveDbTarget(options: ResolveDbTargetOptions): DbTarget {
  const { argv, env, writes } = options;
  const useProd = argv.includes("--prod");
  const url = useProd ? env.PROD_TURSO_DATABASE_URL : env.TURSO_DATABASE_URL;
  const authToken = useProd ? env.PROD_TURSO_AUTH_TOKEN : env.TURSO_AUTH_TOKEN;
  if (!url?.trim()) {
    throw new Error(
      useProd
        ? "PROD_TURSO_DATABASE_URL is required for --prod (see packages/server/.env.example)"
        : "TURSO_DATABASE_URL is required (see packages/server/.env.example)",
    );
  }
  const host = hostOf(url);
  const kind: DbTargetKind = useProd
    ? "production"
    : host.includes(STAGING_MARKER)
      ? "staging"
      : "other";

  if (writes && kind === "other" && !argv.includes("--unsafe-target")) {
    throw new Error(
      `refusing to WRITE to "${host}": it is not a staging database (host lacks "${STAGING_MARKER}"). ` +
        "Point TURSO_DATABASE_URL at a staging copy, pass --prod to target production via the " +
        "PROD_TURSO_* pair, or pass --unsafe-target for a local database.",
    );
  }
  return { url, authToken, host, kind };
}

/** One-line announcement every script prints before its first query. */
export function describeDbTarget(target: DbTarget, purpose: string): string {
  const label =
    target.kind === "production"
      ? "PRODUCTION"
      : target.kind === "staging"
        ? "staging"
        : "an unmanaged database";
  return `[db-target] ${purpose}: ${label} (${target.host})`;
}

/**
 * Resolve, announce, and open the target. Scripts call this instead of
 * `initDb()` so the guard above is the only path to a connection.
 */
export async function connectDbTarget(options: {
  readonly writes: boolean;
  readonly purpose: string;
  readonly argv?: readonly string[];
}): Promise<DbTarget> {
  const target = resolveDbTarget({
    argv: options.argv ?? process.argv,
    env: process.env,
    writes: options.writes,
  });
  console.log(describeDbTarget(target, options.purpose));
  if (target.kind === "production" && options.writes) {
    console.warn("[db-target] ⚠ this script WRITES and is pointed at PRODUCTION");
  }
  await initDb({ url: target.url, authToken: target.authToken });
  return target;
}
