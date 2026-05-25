import { type Client, createClient } from "@libsql/client";
import { assertAtLatestVersion } from "./migrations/migrator.ts";

let db: Client | null = null;

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
  db = createClient({ url, authToken });
  await assertAtLatestVersion(db);
  return db;
}
