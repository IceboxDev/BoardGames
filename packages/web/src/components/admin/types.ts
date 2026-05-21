/**
 * Row shape returned by `authClient.admin.listUsers()`. Defined as a Zod
 * schema in `@boardgames/core/protocol` so the entire admin tree imports a
 * single, validated type — and so {@link AdminPage} can parse the SDK
 * response through `AdminUserListSchema` instead of `as unknown as`-casting.
 *
 * Re-exported from here for backwards-compat with the prior hand-rolled
 * type; existing call sites continue importing from
 * `components/admin/types` and `components/admin` with no churn.
 */
export type { AdminUser } from "@boardgames/core/protocol";
