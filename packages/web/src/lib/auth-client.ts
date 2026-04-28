import { adminClient, inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { API_BASE } from "./api-base";

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

export const { signIn, signUp, signOut, useSession } = authClient;
