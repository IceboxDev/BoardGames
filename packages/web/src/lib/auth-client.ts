import { adminClient, inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { API_BASE } from "./api-base";

/**
 * The one Better-Auth client instance for the whole web package. Every
 * auth-related call (sign in / sign out / sign up / admin actions / session
 * read) routes through `authClient.*` so there is exactly one origin of
 * auth behavior to debug.
 *
 * `useSession` is intentionally NOT re-exported from this module. The only
 * legitimate consumer is `hooks/useCurrentUser.ts`, which narrows the
 * untyped Better-Auth response through `SessionUserSchema` and returns a
 * typed `{ user, isLoading, isAdmin }` triple. Everything else in the app
 * (route guards, profile screen, history, game gallery, …) talks to
 * `useCurrentUser` — that way we have a single, schema-validated entry
 * point for the current-user shape and changes to Better-Auth's payload
 * land in exactly one file. The biome `noRestrictedImports` rule in
 * `biome.json` pins this contract by forbidding direct
 * `better-auth/react` imports outside this file.
 */
export const authClient = createAuthClient({
  baseURL: API_BASE ? `${API_BASE}/api/auth` : undefined,
  fetchOptions: { credentials: "include" },
  plugins: [
    adminClient(),
    inferAdditionalFields({
      user: {
        onlineEnabled: { type: "boolean", required: false, input: false },
      },
    }),
  ],
});

export const { signIn, signUp, signOut } = authClient;
