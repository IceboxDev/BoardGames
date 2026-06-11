import { OnlineModeSchema, SlugListSchema } from "@boardgames/core/protocol";
import { LibsqlDialect } from "@libsql/kysely-libsql";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { z } from "zod";
import { getDb, getDbConnectionConfig } from "../db.ts";
import { jsonColumn, parseRow } from "../lib/db-rows.ts";
import { captureResetToken } from "./reset-link.ts";

/** Row projection for `SELECT game_slugs_json, online_mode FROM pending_inventory`. */
const PendingInventoryRowSchema = z.object({
  game_slugs_json: jsonColumn(SlugListSchema),
  online_mode: OnlineModeSchema,
});

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
    // One-time reset links are minted by the admin (no email). better-auth still
    // owns the token's validity, single-use, and expiry; this callback just
    // hands the freshly-minted token to the in-memory sink that the admin
    // reset-link endpoint reads. See auth/reset-link.ts.
    resetPasswordTokenExpiresIn: 60 * 60,
    sendResetPassword: async ({ token }) => {
      captureResetToken(token);
    },
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
      // Three-state participation mode (replaces the legacy `onlineEnabled`
      // boolean — see migration 0003). 'offline' for default new signups,
      // 'both' for the auto-promoted admin, and whatever the pre-register
      // queue stamps for other signups.
      onlineMode: {
        type: "string",
        required: false,
        defaultValue: "offline",
        input: false,
      },
      internal: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false,
      },
      // Guest players are admin-created stubs (no password account, never sign
      // in). They exist so match-history can credit a player who never made an
      // account. Hidden from the main user table and skipped by the pending-
      // inventory transfer in the `after` hook below.
      guest: {
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
          const email = user.email.toLowerCase();
          const isAdmin = email === adminEmail;
          // Gmail "+internal" alias auto-flags QA/test accounts so they
          // never appear in the admin user list.
          const isInternal = /\+internal(?:[+.][^@]*)?@/.test(email);
          // Guest players use a synthetic `@guest.local` email so the admin UI
          // can recognize them without an extra round-trip.
          const isGuest = email.endsWith("@guest.local");
          return {
            data: {
              ...user,
              role: isAdmin ? "admin" : "user",
              onlineMode: isAdmin ? "both" : "offline",
              internal: isInternal,
              guest: isGuest,
            },
          };
        },
        after: async (user) => {
          const email = user.email.toLowerCase();
          if (email === adminEmail) return;
          if (/\+internal(?:[+.][^@]*)?@/.test(email)) return;
          if (email.endsWith("@guest.local")) return;
          try {
            const db = getDb();
            const { rows } = await db.execute(
              "SELECT game_slugs_json, online_mode FROM pending_inventory WHERE id = 1",
            );
            if (rows.length === 0) return;
            // Round-trip the row through the schema so a corrupt
            // pending-inventory cell fails the transfer here rather than
            // propagating into the new user.
            const { game_slugs_json, online_mode } = parseRow(
              PendingInventoryRowSchema,
              rows[0],
              "pending_inventory",
            );
            // Apply slugs + onlineMode + delete the queue row as one atomic
            // batch — partial application would leave a signup with mode but
            // no inventory (or vice-versa) and a stale queue for the next
            // signup to inherit.
            await db.batch(
              [
                {
                  sql: `INSERT INTO user_inventory (user_id, game_slugs_json, updated_at)
                        VALUES (?, ?, datetime('now'))
                        ON CONFLICT(user_id) DO UPDATE SET
                          game_slugs_json = excluded.game_slugs_json,
                          updated_at = excluded.updated_at`,
                  args: [user.id, JSON.stringify(game_slugs_json)],
                },
                {
                  sql: `UPDATE "user" SET "onlineMode" = ? WHERE id = ?`,
                  args: [online_mode, user.id],
                },
                "DELETE FROM pending_inventory WHERE id = 1",
              ],
              "write",
            );
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
