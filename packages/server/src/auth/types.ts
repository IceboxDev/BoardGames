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
 * Env for the `/ws` upgrade route. Authenticated by `requireWsAuth`, which
 * resolves the caller from a short-lived query-param ticket (or the session
 * cookie in same-origin dev) and exposes only the user id.
 */
export type WsEnv = {
  Variables: {
    wsUserId: string;
  };
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
