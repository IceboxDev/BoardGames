/**
 * Pull a human-readable string out of whatever an async source threw / set
 * as `error`. Returns `null` when there is no error, so call sites can chain
 * the helper with `??` instead of nesting ternaries.
 *
 * Replaces this pattern, which used to appear 5+ times across the admin /
 * draft-list code paths:
 *
 * ```ts
 * const errorMessage = usersQuery.error
 *   ? usersQuery.error instanceof Error
 *     ? usersQuery.error.message
 *     : "Failed to load users"
 *   : null;
 * ```
 *
 * With the helper it becomes:
 *
 * ```ts
 * const errorMessage = errorMessageOf(usersQuery.error, "Failed to load users");
 * ```
 *
 * And combining multiple sources is a single `??` chain:
 *
 * ```ts
 * const message =
 *   errorMessageOf(usersQuery.error, "Failed to load users") ??
 *   errorMessageOf(saveMutation.error, "Save failed");
 * ```
 */
export function errorMessageOf(err: unknown, fallback: string): string | null {
  if (err == null) return null;
  if (err instanceof Error) {
    // An Error with an empty message string is still an error worth surfacing,
    // so fall back to the caller's label rather than rendering an empty bar.
    return err.message.trim() ? err.message : fallback;
  }
  if (typeof err === "string") return err.trim() ? err : fallback;
  return fallback;
}
