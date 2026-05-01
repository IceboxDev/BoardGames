import { LibsqlDialect } from "@libsql/kysely-libsql";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { getDb, getDbConnectionConfig } from "../db.ts";

function normalizeOrigin(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (/^https?:\/\//.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

const adminEmail = (process.env.ADMIN_EMAIL ?? "mantas_kandratavicius@yahoo.com").toLowerCase();
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const webOrigins = (process.env.WEB_ORIGIN ?? "").split(",").map(normalizeOrigin).filter(Boolean);
const isProduction = process.env.NODE_ENV === "production";

const { url: dbUrl, authToken: dbAuthToken } = getDbConnectionConfig();
const dialect = new LibsqlDialect({ url: dbUrl, authToken: dbAuthToken });

const baseURL = process.env.BETTER_AUTH_URL
  ? normalizeOrigin(process.env.BETTER_AUTH_URL)
  : "http://localhost:3001";

export const auth = betterAuth({
  database: { dialect, type: "sqlite" },
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 8,
  },
  socialProviders:
    googleClientId && googleClientSecret
      ? {
          google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret,
          },
        }
      : undefined,
  user: {
    additionalFields: {
      onlineEnabled: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false,
      },
    },
  },
  plugins: [admin()],
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const isAdmin = user.email.toLowerCase() === adminEmail;
          return {
            data: {
              ...user,
              role: isAdmin ? "admin" : "user",
              onlineEnabled: isAdmin,
            },
          };
        },
        after: async (user) => {
          if (user.email.toLowerCase() === adminEmail) return;
          try {
            const db = getDb();
            const { rows } = await db.execute(
              "SELECT game_slugs_json FROM pending_inventory WHERE id = 1",
            );
            if (rows.length === 0) return;
            const json = rows[0].game_slugs_json as string;
            await db.execute({
              sql: `INSERT INTO user_inventory (user_id, game_slugs_json, updated_at)
                    VALUES (?, ?, datetime('now'))
                    ON CONFLICT(user_id) DO UPDATE SET
                      game_slugs_json = excluded.game_slugs_json,
                      updated_at = excluded.updated_at`,
              args: [user.id, json],
            });
            await db.execute("DELETE FROM pending_inventory WHERE id = 1");
          } catch (err) {
            console.error("[auth] failed to transfer pending inventory:", err);
          }
        },
      },
    },
  },
  trustedOrigins: [
    "http://localhost:5173",
    "http://localhost:3001",
    "http://127.0.0.1:5173",
    ...webOrigins,
  ],
  advanced: {
    defaultCookieAttributes: isProduction
      ? { sameSite: "none", secure: true, httpOnly: true }
      : { sameSite: "lax", httpOnly: true },
  },
});

export type Auth = typeof auth;
