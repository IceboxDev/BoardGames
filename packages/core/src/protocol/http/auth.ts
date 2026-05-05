import { z } from "zod";

// ── Auth config (public) ───────────────────────────────────────────────

export const AuthConfigSchema = z.object({
  googleEnabled: z.boolean(),
});
export type AuthConfig = z.infer<typeof AuthConfigSchema>;

// ── Session user ───────────────────────────────────────────────────────

/**
 * Narrow projection of better-auth's session user — only the fields the app
 * actually reads. The custom `role` and `onlineEnabled` fields are added by
 * the server's better-auth config; they're not part of better-auth's default
 * types, so this schema is the single source of truth.
 */
export const SessionUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
  role: z.enum(["admin", "user"]).default("user"),
  onlineEnabled: z.boolean().default(false),
});
export type SessionUser = z.infer<typeof SessionUserSchema>;

// ── Admin: online toggle ───────────────────────────────────────────────

export const SetOnlineBodySchema = z.object({
  onlineEnabled: z.boolean(),
});
export type SetOnlineBody = z.infer<typeof SetOnlineBodySchema>;
