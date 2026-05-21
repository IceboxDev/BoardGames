import { type AdminUser, AdminUserListSchema } from "@boardgames/core/protocol";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { authClient } from "../lib/auth-client.ts";
import { qk } from "../lib/query-keys.ts";

export type { AdminUser };

/**
 * High water-mark for the admin user list. Chosen to comfortably exceed
 * the realistic installed-app user count so {@link useAdminUsers} can
 * share one react-query cache entry across all consumers — AdminPage,
 * which renders every row, and RecordMatchModal, which uses the list as
 * the participant picker.
 *
 * Putting this on the queryKey would fragment the cache (one entry per
 * limit) and force a re-fetch each time a consumer mounted with a
 * different limit. Keeping a single limit baked into the hook makes the
 * cache deduplicate naturally; if the deployment ever outgrows it, raise
 * the constant here once — and reconsider whether the admin UI needs
 * real pagination.
 */
const LIST_LIMIT = 500;

/**
 * Single read of the admin user list. Schema-validates the raw better-
 * auth payload through {@link AdminUserListSchema}, so the result is
 * typed `AdminUser[]` and any shape drift surfaces as a `ZodError` for
 * the top-level RouteErrorBoundary to render.
 *
 * Both AdminPage and RecordMatchModal call this hook so the participant
 * picker doesn't trigger a second `admin.listUsers` request when the
 * admin page is already open. Mutations elsewhere invalidate the same
 * key via `queryClient.invalidateQueries({ queryKey: qk.adminUsers() })`.
 */
export function useAdminUsers(): UseQueryResult<AdminUser[], Error> {
  return useQuery({
    queryKey: qk.adminUsers(),
    queryFn: async () => {
      const { data, error } = await authClient.admin.listUsers({
        query: { limit: LIST_LIMIT },
      });
      if (error) throw new Error(error.message ?? "Failed to load users");
      return AdminUserListSchema.parse(data?.users ?? []);
    },
  });
}
