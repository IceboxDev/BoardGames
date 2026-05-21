import { type SessionUser, SessionUserSchema } from "@boardgames/core/protocol";
import { useMemo } from "react";
import { authClient } from "../lib/auth-client.ts";

export type { SessionUser } from "@boardgames/core/protocol";

interface UseCurrentUserResult {
  user: SessionUser | null;
  isLoading: boolean;
  isAdmin: boolean;
}

/**
 * Single source of truth for the current user. Every consumer in the app
 * (route guards, profile / admin / history pages, RSVP modal, …) reads
 * from here so the four ad-hoc `(session?.user as { role?: string })`
 * casts that used to live around the codebase are eliminated.
 *
 * Better-auth's session shape is opaque to TypeScript (its custom-fields
 * plugin doesn't expose `role`/`onlineEnabled` in the inferred types), so
 * we narrow it once with `SessionUserSchema.safeParse` and let downstream
 * code trust the result. This module is the only file outside
 * `lib/auth-client.ts` that may pull from Better-Auth directly — the
 * biome `noRestrictedImports` rule keeps that contract honest.
 */
export function useCurrentUser(): UseCurrentUserResult {
  const { data, isPending } = authClient.useSession();
  return useMemo<UseCurrentUserResult>(() => {
    if (isPending) return { user: null, isLoading: true, isAdmin: false };
    const raw = data?.user;
    if (!raw) return { user: null, isLoading: false, isAdmin: false };
    const parsed = SessionUserSchema.safeParse(raw);
    if (!parsed.success) {
      // Surfaces in the console; don't crash. The UI behaves as if the user
      // is logged out — the route guard will redirect to /login on the next
      // navigation. Better than rendering with bogus permissions.
      console.warn("SessionUser shape mismatch:", parsed.error.issues);
      return { user: null, isLoading: false, isAdmin: false };
    }
    return {
      user: parsed.data,
      isLoading: false,
      isAdmin: parsed.data.role === "admin",
    };
  }, [data, isPending]);
}
