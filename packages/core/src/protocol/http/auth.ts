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

// ── Admin: user list (better-auth admin plugin response) ───────────────

/**
 * Shape of one row returned by `authClient.admin.listUsers()`. Covers
 * better-auth's stock User columns (`id`, `email`, `name`, `image`,
 * `emailVerified`, `createdAt`, `updatedAt`), the admin plugin's
 * ban/role columns (`role`, `banned`, `banReason`, `banExpires`), and the
 * two custom fields this app's better-auth config adds (`onlineEnabled`,
 * plus `internal`/`guest` flags on user rows). Fields beyond those are
 * stripped — the schema's default `strip` mode is the boundary contract.
 *
 * `role` is intentionally typed as a free string rather than the strict
 * `"admin" | "user"` union used by {@link SessionUserSchema}, because the
 * admin plugin is configurable on the server — a future "moderator" role
 * must not crash the whole admin page. Authorization checks key on the
 * exact string "admin"; everything else degrades to a plain user.
 *
 * Date-shaped fields (`createdAt`, `updatedAt`, `banExpires`) accept
 * either an ISO string (the wire shape) or a `Date` instance (some
 * better-auth SDK paths and test fixtures pass `Date`s through). We do
 * not normalize to one or the other here — consumers either don't read
 * the field or handle both. Locking it to one shape would cascade churn
 * into the AdminUser test fixtures for no real benefit.
 *
 * Optional/nullable fields are typed `.nullable().optional()` because
 * better-auth round-trips `null` through JSON for unset values but the
 * field can also be absent entirely (e.g. a fresh row before a ban
 * column has ever been written). `image` and `emailVerified` follow the
 * same convention even though they are part of stock better-auth — the
 * admin plugin can omit them depending on the underlying adapter.
 */
export const AdminUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  image: z.string().nullable().optional(),
  emailVerified: z.boolean().nullable().optional(),
  role: z.string().nullable().optional(),
  onlineEnabled: z.boolean().nullable().optional(),
  internal: z.boolean().nullable().optional(),
  guest: z.boolean().nullable().optional(),
  banned: z.boolean().nullable().optional(),
  banReason: z.string().nullable().optional(),
  banExpires: z.union([z.string(), z.date()]).nullable().optional(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]).optional(),
});
export type AdminUser = z.infer<typeof AdminUserSchema>;

export const AdminUserListSchema = z.array(AdminUserSchema);
export type AdminUserList = z.infer<typeof AdminUserListSchema>;
