import type { auth } from "./config.ts";

type ResolvedSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

export type AuthUser = ResolvedSession["user"];
export type AuthSession = ResolvedSession["session"];

export type AdminUser = AuthUser & { role: "admin" };

export type AppEnv = {
  Variables: {
    user: AuthUser;
    session: AuthSession;
  };
};

export type AdminEnv = {
  Variables: {
    user: AdminUser;
    session: AuthSession;
  };
};

export type PublicEnv = {
  Variables: Record<string, never>;
};

/**
 * Env for routes mounted under `/api/ical/*`. Authenticated via a path-token
 * (no session). The middleware looks up `calendar_feed_tokens` by sha256
 * hash and exposes the matched user id here.
 */
export type FeedEnv = {
  Variables: {
    feedUserId: string;
  };
};
